import { accountTransferInputSchema, accountTransferSchema } from '../models/accountTransfer';
import { accountTransferRepository, type AccountTransferRepository } from '../repositories/account-transfer.repository';
import { financeUnitOfWorkRepository, type FinanceUnitOfWorkRepository } from '../repositories/finance-unit-of-work.repository';
import type { AccountTransferRecord, FinancialModule } from '../types/database';
import { identityProvider, type IdentityProvider } from '../utils/identity';
import { calculateAccountBalances, financialAccountService, type FinancialAccountService } from './financialAccount.service';
import { executeService, ServiceError, type ServiceResult } from './serviceResult';

export interface AccountTransferInput {
  module: FinancialModule;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  description: string;
  date?: string;
}

export class AccountTransferService {
  constructor(
    private readonly repository: AccountTransferRepository = accountTransferRepository,
    private readonly unitOfWork: FinanceUnitOfWorkRepository = financeUnitOfWorkRepository,
    private readonly accounts: FinancialAccountService = financialAccountService,
    private readonly identity: IdentityProvider = identityProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(input: unknown): Promise<ServiceResult<AccountTransferRecord>> {
    return executeService('accountTransfer.create', async () => {
      const parsed = accountTransferInputSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', 'Los datos de la transferencia no son válidos.', { cause: parsed.error });
      const value = parsed.data;
      const initialized = await this.accounts.initialize(value.module);
      if (!initialized.ok) throw initialized.error;

      return this.unitOfWork.withAccountTransferTransaction(async (unit) => {
        const accounts = await unit.accounts(value.module);
        const source = accounts.find((account) => account.id === value.sourceAccountId);
        const destination = accounts.find((account) => account.id === value.destinationAccountId);
        if (!source || !destination) throw new ServiceError('NOT_FOUND', 'La cuenta de origen o destino no existe en este módulo.');
        if (source.id === destination.id) throw new ServiceError('VALIDATION', 'El origen y el destino deben ser cuentas distintas.');

        const [personal, business, transfers, savings, settings, journeys] = await Promise.all([
          unit.personalMovements(), unit.businessMovements(), unit.transfers(value.module),
          unit.savings(), unit.settings(), unit.journeys(),
        ]);
        const balances = calculateAccountBalances(value.module, accounts, personal, business, transfers, savings, settings, journeys);
        const sourceBalance = balances.accounts.find((item) => item.account.id === source.id)?.balance ?? 0;
        if (value.amount > sourceBalance) throw new ServiceError('INSUFFICIENT_FUNDS', 'Saldo insuficiente en la cuenta de origen.');

        const timestamp = this.now().toISOString();
        const candidate: AccountTransferRecord = {
          ...value,
          id: this.identity.createId(),
          date: value.date ?? timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        };
        const record = accountTransferSchema.safeParse(candidate);
        if (!record.success) throw new ServiceError('VALIDATION', 'La transferencia no cumple el modelo de datos.', { cause: record.error });
        await unit.addTransfer(record.data);
        return record.data;
      });
    });
  }

  findAll(module: FinancialModule, options?: { includeDeleted?: boolean }): Promise<ServiceResult<AccountTransferRecord[]>> {
    return executeService('accountTransfer.findAll', async () => (await this.repository.findAll(options)).filter((transfer) => transfer.module === module));
  }

  search(module: FinancialModule, query: string, includeDeleted = false): Promise<ServiceResult<AccountTransferRecord[]>> {
    return executeService('accountTransfer.search', async () => (await this.repository.search({ query, includeDeleted })).filter((transfer) => transfer.module === module));
  }

  delete(id: string): Promise<ServiceResult<AccountTransferRecord>> {
    return executeService('accountTransfer.delete', () => this.changeDeletedState(id, false));
  }

  restore(id: string): Promise<ServiceResult<AccountTransferRecord>> {
    return executeService('accountTransfer.restore', () => this.changeDeletedState(id, true));
  }

  private changeDeletedState(id: string, restore: boolean): Promise<AccountTransferRecord> {
    return this.unitOfWork.withAccountTransferTransaction(async (unit) => {
      const current = await unit.transfer(id);
      if (!current || Boolean(current.deletedAt) === !restore) {
        throw new ServiceError('NOT_FOUND', restore ? 'No se encontró una transferencia eliminada.' : 'No se encontró una transferencia activa.');
      }
      const accounts = await unit.accounts(current.module);
      const [personal, business, transfers, savings, settings, journeys] = await Promise.all([
        unit.personalMovements(), unit.businessMovements(), unit.transfers(current.module), unit.savings(), unit.settings(),
        unit.journeys(),
      ]);
      const balances = calculateAccountBalances(current.module, accounts, personal, business, transfers, savings, settings, journeys);
      if (restore) {
        const sourceBalance = balances.accounts.find((item) => item.account.id === current.sourceAccountId)?.balance ?? 0;
        if (sourceBalance < current.amount) throw new ServiceError('INSUFFICIENT_FUNDS', 'Saldo insuficiente para restaurar la transferencia.');
        return unit.restoreTransfer(id, this.now().toISOString());
      }
      const destinationBalance = balances.accounts.find((item) => item.account.id === current.destinationAccountId)?.balance ?? 0;
      if (destinationBalance < current.amount) throw new ServiceError('INSUFFICIENT_FUNDS', 'No se puede eliminar: la cuenta destino ya utilizó ese saldo.');
      return unit.deleteTransfer(id, this.now().toISOString());
    });
  }
}

export const accountTransferService = new AccountTransferService();