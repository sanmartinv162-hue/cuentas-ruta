import { savingSchema } from '../models/saving';
import { savingRepository, type SavingRepository } from '../repositories/saving.repository';
import type { SavingRecord } from '../types/database';
import { financeUnitOfWorkRepository, type FinanceUnitOfWorkRepository } from '../repositories/finance-unit-of-work.repository';
import { identityProvider, type IdentityProvider } from '../utils/identity';
import { executeService, ServiceError, type ServiceResult } from './serviceResult';
import { calculateAccountBalances, financialAccountService, type FinancialAccountService } from './financialAccount.service';

export interface SavingInput {
  amount: number;
  description: string;
  date?: string;
  accountId?: string;
}

export class SavingService {
  constructor(
    private readonly repository: SavingRepository = savingRepository,
    private readonly unitOfWork: FinanceUnitOfWorkRepository = financeUnitOfWorkRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly identity: IdentityProvider = identityProvider,
    private readonly accounts: FinancialAccountService = financialAccountService,
  ) {}

  balance(): Promise<ServiceResult<number>> {
    return executeService('saving.balance', async () => this.recalculate(await this.repository.findAll()).balance);
  }

  deposit(input: SavingInput): Promise<ServiceResult<SavingRecord>> {
    return executeService('saving.deposit', async () => this.createMovement('deposit', input));
  }

  withdraw(input: SavingInput): Promise<ServiceResult<SavingRecord>> {
    return executeService('saving.withdraw', async () => this.createMovement('withdraw', input));
  }

  findAll(options?: { includeDeleted?: boolean }): Promise<ServiceResult<SavingRecord[]>> {
    return executeService('saving.findAll', () => this.repository.findAll(options));
  }

  delete(id: string): Promise<ServiceResult<SavingRecord>> {
    return executeService('saving.delete', () => this.unitOfWork.withSavingsTransaction(async (unit) => {
      const current = (await this.repository.findById(id)) ?? await this.repository.findById(id, true);
      if (!current || current.deletedAt) throw new ServiceError('NOT_FOUND', 'No se encontró el movimiento de ahorro.');
      const timestamp = this.now().toISOString();
      const deleted = await unit.softDeleteSaving(id, timestamp);
      const active = (await unit.savings()).filter((record) => record.id !== id);
      const recalculated = this.recalculate(active);
      for (const record of recalculated.records) await unit.putSaving(record);
      await unit.setBusinessSaving(recalculated.balance, timestamp);
      return deleted;
    }));
  }

  restore(id: string): Promise<ServiceResult<SavingRecord>> {
    return executeService('saving.restore', () => this.unitOfWork.withSavingsTransaction(async (unit) => {
      const timestamp = this.now().toISOString();
      const restored = await unit.restoreSaving(id, timestamp);
      const recalculated = this.recalculate([...await unit.savings(), restored]);
      for (const record of recalculated.records) await unit.putSaving(record);
      await unit.setBusinessSaving(recalculated.balance, timestamp);
      return recalculated.records.find((record) => record.id === id)!;
    }));
  }

  private async createMovement(type: 'deposit' | 'withdraw', input: SavingInput): Promise<SavingRecord> {
    const accountResult = await this.accounts.initialize('business');
    if (!accountResult.ok) throw accountResult.error;
    const account = input.accountId
      ? accountResult.value.find((item) => item.id === input.accountId)
      : accountResult.value.find((item) => item.name.toLocaleLowerCase('es-CO') === 'efectivo');
    if (!account) throw new ServiceError('NOT_FOUND', 'Selecciona una cuenta del negocio existente.');
    return this.unitOfWork.withSavingsTransaction(async (unit) => {
      if (type === 'deposit') {
        const [accounts, personalMovements, businessMovements, transfers, savings, settings, journeys] = await Promise.all([
          unit.businessAccounts(), unit.personalMovements(), unit.businessMovements(), unit.transfers(), unit.savings(), unit.settings(), unit.journeys(),
        ]);
        const snapshot = calculateAccountBalances('business', accounts, personalMovements, businessMovements, transfers, savings, settings, journeys);
        const available = snapshot.accounts.find((item) => item.account.id === account.id)?.balance ?? 0;
        if (input.amount > available) throw new ServiceError('INSUFFICIENT_FUNDS', 'Saldo insuficiente en la cuenta seleccionada.');
      }
      const date = input.date ?? this.now().toISOString();
      if (Number.isNaN(new Date(date).getTime())) throw new ServiceError('VALIDATION', 'La fecha del movimiento de ahorro no es válida.');
      const timestamp = this.now().toISOString();
      const candidate: SavingRecord = {
        id: this.identity.createId(), type, amount: input.amount, accountId: account.id, description: input.description,
        balanceAfter: 0, date, createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
      };
      const parsed = savingSchema.safeParse(candidate);
      if (!parsed.success) throw new ServiceError('VALIDATION', 'Los datos del movimiento de ahorro no son válidos.', { cause: parsed.error });
      const recalculated = this.recalculate([...await unit.savings(), parsed.data]);
      const saved = recalculated.records.find((record) => record.id === candidate.id)!;
      await unit.addSaving(saved);
      for (const record of recalculated.records) {
        if (record.id !== saved.id) await unit.putSaving(record);
      }
      await unit.setBusinessSaving(recalculated.balance, timestamp);
      return saved;
    });
  }

  private recalculate(records: SavingRecord[]): { records: SavingRecord[]; balance: number } {
    let balance = 0;
    const ordered = [...records].sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt));
    const updated = ordered.map((record) => {
      balance += record.type === 'deposit' ? record.amount : -record.amount;
      if (balance < 0) throw new ServiceError('INSUFFICIENT_FUNDS', 'Esta operación dejaría un retiro sin fondos.');
      return { ...record, balanceAfter: balance };
    });
    return { records: updated, balance };
  }
}

export const savingService = new SavingService();
