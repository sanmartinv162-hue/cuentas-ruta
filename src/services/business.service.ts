import { businessMovementInputSchema, businessMovementUpdateSchema } from '../models/businessMovement';
import { businessMovementRepository, type BusinessMovementRepository } from '../repositories/business.repository';
import type { SearchOptions } from '../repositories/base.repository';
import { journeyRepository, type JourneyRepository } from '../repositories/journey.repository';
import type { BusinessMovementRecord } from '../types/database';
import { identityProvider, type IdentityProvider } from '../utils/identity';
import { classificationService, type ClassificationService } from './classification.service';
import { executeService, ServiceError, unwrapServiceResult, type ServiceResult } from './serviceResult';
import { financialAccountService, type FinancialAccountService } from './financialAccount.service';

export class BusinessService {
  constructor(
    private readonly repository: BusinessMovementRepository = businessMovementRepository,
    private readonly journeys: JourneyRepository = journeyRepository,
    private readonly classifier: ClassificationService = classificationService,
    private readonly identity: IdentityProvider = identityProvider,
    private readonly now: () => Date = () => new Date(),
    private readonly accounts: FinancialAccountService = financialAccountService,
  ) {}

  create(input: unknown): Promise<ServiceResult<BusinessMovementRecord>> {
    return executeService('business.create', async () => {
      const parsed = businessMovementInputSchema.safeParse(input);
      if (parsed.success) this.assertNotFuture(parsed.data.date);
      if (!parsed.success) throw new ServiceError('VALIDATION', 'Los datos del movimiento del negocio no son válidos.', { cause: parsed.error });
      const activeJourneys = (await this.journeys.findAll()).filter((journey) => journey.status === 'active');
      if (activeJourneys.length !== 1) throw new ServiceError('VALIDATION', activeJourneys.length ? 'Hay más de una jornada activa; corrige el estado antes de registrar.' : 'Inicia una jornada antes de registrar movimientos del negocio.');
      const value = await this.withAccount(parsed.data);
      const match = value.type === 'expense' ? unwrapServiceResult(await this.classifier.classify(value.description, 'deliveries')) : null;
      const category = value.detectedCategory || match?.category || '';
      if (value.type === 'expense' && value.detectedCategory && value.detectedCategory !== match?.category) {
        unwrapServiceResult(await this.classifier.learn(value.description, value.detectedCategory));
      }
      const timestamp = this.now().toISOString();
      const record: BusinessMovementRecord = {
        ...value,
        id: this.identity.createId(),
        journeyId: activeJourneys[0].id,
        deliveryCount: value.type === 'income' ? 1 : 0,
        detectedCategory: category,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        version: 1,
        synced: false,
        syncVersion: 0,
        deviceId: await this.identity.getDeviceId(),
      };
      return this.repository.create(record);
    });
  }

  update(id: string, changes: unknown): Promise<ServiceResult<BusinessMovementRecord>> {
    return executeService('business.update', async () => {
      const parsed = businessMovementUpdateSchema.safeParse(changes);
      if (parsed.success && parsed.data.date) this.assertNotFuture(parsed.data.date);
      if (!parsed.success) throw new ServiceError('VALIDATION', 'Los cambios del movimiento del negocio no son válidos.', { cause: parsed.error });
      const current = await this.repository.findById(id);
      if (!current) throw new ServiceError('NOT_FOUND', 'No se encontró el movimiento del negocio.');
      const merged = await this.withAccount({ ...current, ...parsed.data }, current);
      if (merged.type === 'expense' && !parsed.data.detectedCategory && parsed.data.description) {
        merged.detectedCategory = unwrapServiceResult(await this.classifier.classify(merged.description, 'deliveries'))?.category ?? current.detectedCategory;
      }
      merged.deliveryCount = merged.type === 'income' ? 1 : 0;
      return this.repository.update(id, merged);
    });
  }

  delete(id: string): Promise<ServiceResult<BusinessMovementRecord>> {
    return executeService('business.delete', async () => {
      const current = await this.repository.findById(id);
      if (!current) throw new ServiceError('NOT_FOUND', 'No se encontró el movimiento del negocio.');
      await this.validateBalanceEffect(current, false);
      return this.repository.delete(id);
    });
  }

  restore(id: string): Promise<ServiceResult<BusinessMovementRecord>> {
    return executeService('business.restore', async () => {
      const current = await this.repository.findById(id, true);
      if (!current?.deletedAt) throw new ServiceError('NOT_FOUND', 'No se encontró el movimiento del negocio eliminado.');
      await this.validateBalanceEffect(current, true);
      return this.repository.restore(id);
    });
  }

  findById(id: string, includeDeleted = false): Promise<ServiceResult<BusinessMovementRecord | null>> {
    return executeService('business.findById', () => this.repository.findById(id, includeDeleted));
  }

  findAll(options?: { includeDeleted?: boolean }): Promise<ServiceResult<BusinessMovementRecord[]>> {
    return executeService('business.findAll', () => this.repository.findAll(options));
  }

  search(options?: SearchOptions): Promise<ServiceResult<BusinessMovementRecord[]>> {
    return executeService('business.search', () => this.repository.search(options));
  }

  count(options?: { includeDeleted?: boolean }): Promise<ServiceResult<number>> {
    return executeService('business.count', () => this.repository.count(options));
  }

  correctCategory(id: string, category: string): Promise<ServiceResult<BusinessMovementRecord>> {
    return executeService('business.correctCategory', async () => {
      const current = await this.repository.findById(id);
      if (!current) throw new ServiceError('NOT_FOUND', 'No se encontró el movimiento del negocio.');
      const cleanCategory = category.trim();
      if (!cleanCategory) throw new ServiceError('VALIDATION', 'La categoría no puede estar vacía.');
      const updated = await this.repository.update(id, { detectedCategory: cleanCategory });
      unwrapServiceResult(await this.classifier.learn(current.description, cleanCategory));
      return updated;
    });
  }

  private async withAccount<T extends { accountId?: string; paymentMethod: string; amount: number; type: 'income' | 'expense' }>(value: T, previous?: BusinessMovementRecord): Promise<T & { accountId: string; paymentMethod: string }> {
    const result = await this.accounts.initialize('business');
    if (!result.ok) throw result.error;
    const account = value.accountId
      ? result.value.find((item) => item.id === value.accountId)
      : result.value.find((item) => item.name.toLocaleLowerCase('es-CO') === value.paymentMethod.trim().toLocaleLowerCase('es-CO'));
    if (!account) throw new ServiceError('VALIDATION', 'Selecciona una cuenta del negocio existente.');
    if (value.type === 'expense') {
      const snapshot = await this.accounts.balances('business');
      if (!snapshot.ok) throw snapshot.error;
      const priorEffect = previous?.accountId === account.id
        ? previous.type === 'income' ? -previous.amount : previous.amount
        : 0;
      const available = (snapshot.value.accounts.find((item) => item.account.id === account.id)?.balance ?? 0) + priorEffect;
      if (value.amount > available) throw new ServiceError('INSUFFICIENT_FUNDS', 'Saldo insuficiente en la cuenta seleccionada.');
    }
    return { ...value, accountId: account.id, paymentMethod: account.name };
  }

  private assertNotFuture(date: string): void {
    if (new Date(date).getTime() > this.now().getTime()) {
      throw new ServiceError('VALIDATION', 'La fecha del movimiento no puede estar en el futuro.');
    }
  }

  private async validateBalanceEffect(movement: BusinessMovementRecord, restoring: boolean): Promise<void> {
    const result = await this.accounts.balances('business');
    if (!result.ok) throw result.error;
    const account = result.value.accounts.find((item) => item.account.id === movement.accountId || item.account.name.toLocaleLowerCase('es-CO') === movement.paymentMethod.toLocaleLowerCase('es-CO'));
    const currentBalance = account?.balance ?? 0;
    const movementEffect = movement.type === 'income' ? movement.amount : -movement.amount;
    const projectedBalance = currentBalance + (restoring ? movementEffect : -movementEffect);
    if (projectedBalance < 0) throw new ServiceError('INSUFFICIENT_FUNDS', 'No se puede modificar el historial: la cuenta quedaría con saldo negativo.');
  }
}

export const businessService = new BusinessService();
