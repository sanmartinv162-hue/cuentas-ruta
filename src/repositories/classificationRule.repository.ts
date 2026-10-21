import { db, type FinanceAssistantDatabase } from '../database/db';
import { classificationRuleSchema } from '../models/classificationRule';
import type { ClassificationRuleRecord } from '../types/database';
import { BaseRepository } from './base.repository';

export class ClassificationRuleRepository extends BaseRepository<ClassificationRuleRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.classificationRules, classificationRuleSchema, {
      dateField: 'createdAt',
      searchableFields: ['keyword', 'category', 'id'],
    });
  }

  async findByKeyword(keyword: string): Promise<ClassificationRuleRecord | null> {
    const normalized = keyword.trim().toLocaleLowerCase('es-CO');
    if (!normalized) return null;
    const rules = await this.findAll();
    return rules.find((rule) => rule.keyword.toLocaleLowerCase('es-CO') === normalized) ?? null;
  }
}

export const classificationRuleRepository = new ClassificationRuleRepository();
