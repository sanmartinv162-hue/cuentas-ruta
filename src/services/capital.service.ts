import { capitalSchema } from '../models/capital';
import { businessMovementRepository, type BusinessMovementRepository } from '../repositories/business.repository';
import { capitalRepository, type CapitalRepository } from '../repositories/capital.repository';
import { savingRepository, type SavingRepository } from '../repositories/saving.repository';
import type { CapitalRecord, BusinessMovementRecord } from '../types/database';
import { executeService, ServiceError, type ServiceResult } from './serviceResult';
import { financialAccountService, type FinancialAccountService } from './financialAccount.service';

export interface CapitalSnapshot extends CapitalRecord {
  income: number;
  expenses: number;
}

function sumProfit(movements: BusinessMovementRecord[]): { income: number; expenses: number; profit: number } {
  const income = movements.filter((movement) => movement.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const expenses = movements.filter((movement) => movement.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  return { income, expenses, profit: income - expenses };
}

export class CapitalService {
  constructor(
    private readonly business: BusinessMovementRepository = businessMovementRepository,
    private readonly savings: SavingRepository = savingRepository,
    private readonly capital: CapitalRepository = capitalRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly accounts: FinancialAccountService = financialAccountService,
  ) {}

  calculate(): Promise<ServiceResult<CapitalSnapshot>> {
    return executeService('capital.calculate', async () => {
      const [movements, savingEntries, accountSnapshot] = await Promise.all([
        this.business.findAll(), this.savings.findAll(), this.accounts.balances('business'),
      ]);
      if (!accountSnapshot.ok) throw accountSnapshot.error;
      const totals = sumProfit(movements);
      const savingsTotal = savingEntries.reduce((balance, entry) => balance + (entry.type === 'deposit' ? entry.amount : -entry.amount), 0);
      if (savingsTotal < 0) throw new ServiceError('DATABASE', 'El historial de ahorro produce un saldo negativo.');
      const availableCapital = accountSnapshot.value.total;
      if (accountSnapshot.value.accounts.some((item) => item.balance < 0)) throw new ServiceError('DATABASE', 'Una cuenta del negocio tiene saldo negativo.');

      const candidate: CapitalRecord = {
        id: 'current',
        currentCapital: availableCapital + savingsTotal,
        availableCapital,
        totalSavings: savingsTotal,
        totalProfit: totals.profit,
        updatedAt: this.now().toISOString(),
      };
      const parsed = capitalSchema.safeParse(candidate);
      if (!parsed.success) throw new ServiceError('DATABASE', 'El capital calculado no cumple las invariantes.', { cause: parsed.error });
      return { ...parsed.data, income: totals.income, expenses: totals.expenses };
    });
  }

  recalculate(): Promise<ServiceResult<CapitalSnapshot>> {
    return executeService('capital.recalculate', async () => {
      const result = await this.calculate();
      if (!result.ok) throw result.error;
      const saved = await this.capital.saveCalculated(result.value);
      return { ...saved, income: result.value.income, expenses: result.value.expenses };
    });
  }

  findCurrent(): Promise<ServiceResult<CapitalRecord | null>> {
    return executeService('capital.findCurrent', () => this.capital.findById('current'));
  }
}

export const capitalService = new CapitalService();
