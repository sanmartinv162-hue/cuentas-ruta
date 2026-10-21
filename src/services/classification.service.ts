import { classificationRuleRepository, type ClassificationRuleRepository } from '../repositories/classificationRule.repository';
import { personalMovementRepository, type PersonalMovementRepository } from '../repositories/personal.repository';
import { businessMovementRepository, type BusinessMovementRepository } from '../repositories/business.repository';
import type { ClassificationRuleRecord } from '../types/database';
import type { LedgerSpace } from '../types';
import { identityProvider, type IdentityProvider } from '../utils/identity';
import { executeService, type ServiceResult } from './serviceResult';

const defaultRules = [
  ['texaco', 'Gasolina'],
  ['primax', 'Gasolina'],
  ['gasolina', 'Gasolina'],
  ['combustible', 'Gasolina'],
  ['tanqueo', 'Gasolina'],
  ['mantenimiento', 'Mantenimiento'],
  ['revision', 'Mantenimiento'],
  ['mercado', 'Alimentación'],
  ['aceite', 'Mantenimiento'],
  ['llanta', 'Repuestos'],
  ['repuesto', 'Repuestos'],
  ['cadena', 'Repuestos'],
  ['freno', 'Repuestos'],
  ['bujia', 'Repuestos'],
] as const;

function normalizeKeyword(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-CO');
}

function tokens(value: string): string[] {
  return [...new Set(normalizeKeyword(value).split(/[^a-z0-9]+/).filter((token) => token.length > 2))];
}

export class ClassificationService {
  private seeded = false;

  constructor(
    private readonly repository: ClassificationRuleRepository = classificationRuleRepository,
    private readonly identity: IdentityProvider = identityProvider,
    private readonly now: () => Date = () => new Date(),
    private readonly personal: PersonalMovementRepository = personalMovementRepository,
    private readonly business: BusinessMovementRepository = businessMovementRepository,
  ) {}

  classify(description: string, space?: LedgerSpace): Promise<ServiceResult<ClassificationRuleRecord | null>> {
    return executeService('classification.classify', async () => {
      await this.ensureDefaults();
      const words = tokens(description);
      if (!words.length) return null;
      const rules = await this.repository.findAll();
      const normalizedDescription = normalizeKeyword(description);
      const matches = rules.map((rule) => {
        const keyword = normalizeKeyword(rule.keyword);
        const score = normalizedDescription === keyword ? 3 : normalizedDescription.includes(keyword) ? 2 : words.some((word) => word === keyword || word.includes(keyword) || keyword.includes(word)) ? 1 : 0;
        return { rule, score };
      }).filter((match) => match.score > 0);
      matches.sort((left, right) => right.score - left.score || right.rule.confidence - left.rule.confidence || right.rule.keyword.length - left.rule.keyword.length);
      if (matches.length) return matches[0].rule;
      return this.classifyFromHistory(description, words, space);
    });
  }

  private async classifyFromHistory(description: string, queryTokens: string[], space?: LedgerSpace): Promise<ClassificationRuleRecord | null> {
    const [personal, business] = await Promise.all([
      space === 'deliveries' ? Promise.resolve([]) : this.personal.findAll(),
      space === 'personal' ? Promise.resolve([]) : this.business.findAll(),
    ]);
    const normalizedDescription = normalizeKeyword(description);
    const matches = [...personal, ...business].filter((movement) => movement.type === 'expense').map((movement) => {
      const historical = normalizeKeyword(movement.description);
      const historicalTokens = tokens(movement.description);
      const overlap = queryTokens.filter((word) => historicalTokens.some((token) => token === word || token.includes(word) || word.includes(token))).length;
      const coverage = overlap / Math.max(queryTokens.length, historicalTokens.length, 1);
      const score = historical === normalizedDescription ? 3 : historical.includes(normalizedDescription) || normalizedDescription.includes(historical) ? 2 : coverage >= 0.5 ? 1 : 0;
      return { movement, score };
    }).filter((match) => match.score > 0);
    matches.sort((left, right) => right.score - left.score || right.movement.date.localeCompare(left.movement.date));
    const match = matches[0];
    if (!match) return null;
    return {
      id: match.movement.id, keyword: queryTokens.join(' '), category: match.movement.detectedCategory,
      timesUsed: 1, confidence: 0.55, createdAt: match.movement.date, deletedAt: null,
    };
  }

  learn(description: string, category: string): Promise<ServiceResult<ClassificationRuleRecord[]>> {
    return executeService('classification.learn', async () => {
      const cleanCategory = category.trim();
      const keywords = tokens(description);
      if (!cleanCategory || !keywords.length) throw new Error('Se requiere descripción y categoría para aprender.');
      const learned: ClassificationRuleRecord[] = [];
      for (const keyword of keywords) {
        const existing = await this.repository.findByKeyword(keyword);
        if (existing) {
          const nextUses = existing.timesUsed + 1;
          learned.push(await this.repository.update(existing.id, {
            category: cleanCategory,
            timesUsed: nextUses,
            confidence: Math.min(1, existing.confidence + (1 - existing.confidence) / nextUses),
          }));
        } else {
          learned.push(await this.repository.create({
            id: this.identity.createId(), keyword, category: cleanCategory, timesUsed: 1,
            confidence: 0.6, createdAt: this.now().toISOString(), deletedAt: null,
          }));
        }
      }
      return learned;
    });
  }

  private async ensureDefaults(): Promise<void> {
    if (this.seeded) return;
    for (const [keyword, category] of defaultRules) {
      if (await this.repository.findByKeyword(keyword)) continue;
      try {
        await this.repository.create({
          id: this.identity.createId(), keyword, category, timesUsed: 0, confidence: 0.8,
          createdAt: this.now().toISOString(), deletedAt: null,
        });
      } catch {
        if (!await this.repository.findByKeyword(keyword)) throw new Error('No se pudieron inicializar reglas de clasificación.');
      }
    }
    this.seeded = true;
  }
}

export const classificationService = new ClassificationService();
