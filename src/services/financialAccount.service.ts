import { financialAccountSchema, normalizeFinancialAccountName } from '../models/financialAccount';
import { financialAccountRepository, type FinancialAccountRepository } from '../repositories/account.repository';
import { accountTransferRepository, type AccountTransferRepository } from '../repositories/account-transfer.repository';
import { personalMovementRepository, type PersonalMovementRepository } from '../repositories/personal.repository';
import { businessMovementRepository, type BusinessMovementRepository } from '../repositories/business.repository';
import { savingRepository, type SavingRepository } from '../repositories/saving.repository';
import { settingsRepository, type SettingsRepository } from '../repositories/settings.repository';
import { journeyRepository, type JourneyRepository } from '../repositories/journey.repository';
import type { AccountTransferRecord, BusinessMovementRecord, FinancialAccountRecord, FinancialModule, JourneyRecord, PersonalMovementRecord, SavingRecord, SettingsRecord } from '../types/database';
import { identityProvider, type IdentityProvider } from '../utils/identity';
import { executeService, ServiceError, type ServiceResult } from './serviceResult';

export interface AccountBalance {
  account: FinancialAccountRecord;
  balance: number;
}

export interface AccountBalanceSnapshot {
  module: FinancialModule;
  accounts: AccountBalance[];
  total: number;
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function accountFor(accounts: FinancialAccountRecord[], accountId: string | undefined, label: string | undefined): FinancialAccountRecord | undefined {
  if (accountId) {
    const byId = accounts.find((account) => account.id === accountId);
    if (byId) return byId;
  }
  if (label) {
    const normalized = label.trim().toLocaleLowerCase('es-CO');
    const byName = accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === normalized);
    if (byName) return byName;
  }
  return accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === 'efectivo') ?? accounts[0];
}

export function calculateAccountBalances(
  module: FinancialModule,
  accounts: FinancialAccountRecord[],
  personalMovements: PersonalMovementRecord[],
  businessMovements: BusinessMovementRecord[],
  transfers: AccountTransferRecord[],
  savings: SavingRecord[],
  settings?: SettingsRecord,
  journeys: JourneyRecord[] = [],
): AccountBalanceSnapshot {
  const balances = new Map(accounts.map((account) => [account.id, 0]));
  const cashAccount = accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === 'efectivo') ?? accounts[0];
  let baselineDate: string | undefined;
  if (module === 'personal' && settings?.personalInitialCapitalByAccount) {
    for (const account of accounts) balances.set(account.id, settings.personalInitialCapitalByAccount[account.id] ?? 0);
  }
  if (module === 'business') {
    const activeJourneys = journeys.filter((journey) => journey.status === 'active' && !journey.deletedAt);
    if (activeJourneys.length > 1) throw new Error('Hay mÃ¡s de una jornada activa; el capital no se puede calcular.');
    const firstJourney = [...journeys].filter((journey) => !journey.deletedAt).sort((left, right) => left.startTime.localeCompare(right.startTime))[0];
    baselineDate = firstJourney?.startTime;
    if (firstJourney?.initialCapitalByAccount) {
      for (const account of accounts) balances.set(account.id, firstJourney.initialCapitalByAccount[account.id] ?? 0);
    } else if (cashAccount) {
      const startingByAccount = settings?.businessInitialCapitalByAccount;
      if (startingByAccount) {
        for (const account of accounts) balances.set(account.id, startingByAccount[account.id] ?? 0);
      } else {
        balances.set(cashAccount.id, firstJourney?.initialCapital ?? settings?.businessInitialCapital ?? 0);
      }
    }
  }

  const firstJourneyId = module === 'business'
    ? [...journeys].filter((journey) => !journey.deletedAt).sort((left, right) => left.startTime.localeCompare(right.startTime))[0]?.id
    : undefined;
  const movements = module === 'personal' ? personalMovements : businessMovements.filter((movement) =>
    !baselineDate || movement.date >= baselineDate || movement.journeyId === firstJourneyId,
  );
  for (const movement of movements) {
    const account = accountFor(accounts, movement.accountId, movement.paymentMethod);
    if (!account) continue;
    const sign = movement.type === 'income' ? 1 : -1;
    balances.set(account.id, (balances.get(account.id) ?? 0) + sign * movement.amount);
  }

  for (const transfer of transfers.filter((item) => module === 'personal' || !baselineDate || item.date >= baselineDate)) {
    const source = balances.get(transfer.sourceAccountId);
    const destination = balances.get(transfer.destinationAccountId);
    // A cross-module transfer has only one local endpoint in each snapshot.
    // Apply whichever endpoint belongs to this module instead of discarding
    // the whole transfer when the other account is in the other module.
    if (source !== undefined) balances.set(transfer.sourceAccountId, source - transfer.amount);
    if (destination !== undefined) balances.set(transfer.destinationAccountId, destination + transfer.amount);
  }

  if (module === 'business') {
    for (const saving of savings.filter((item) => !baselineDate || item.date >= baselineDate)) {
      const account = accountFor(accounts, saving.accountId, undefined);
      if (!account) continue;
      const sign = saving.type === 'deposit' ? -1 : 1;
      balances.set(account.id, (balances.get(account.id) ?? 0) + sign * saving.amount);
    }
  }

  const result = accounts.map((account) => ({ account, balance: balances.get(account.id) ?? 0 }));
  return { module, accounts: result, total: result.reduce((sum, item) => sum + item.balance, 0) };
}

export class FinancialAccountService {
  private readonly initializedModules = new Set<FinancialModule>();
  private readonly initializingModules = new Map<FinancialModule, Promise<ServiceResult<FinancialAccountRecord[]>>>();
  constructor(
    private readonly accounts: FinancialAccountRepository = financialAccountRepository,
    private readonly personal: PersonalMovementRepository = personalMovementRepository,
    private readonly business: BusinessMovementRepository = businessMovementRepository,
    private readonly transfers: AccountTransferRepository = accountTransferRepository,
    private readonly savings: SavingRepository = savingRepository,
    private readonly settings: SettingsRepository = settingsRepository,
    private readonly identity: IdentityProvider = identityProvider,
    private readonly now: () => Date = () => new Date(),
    private readonly journeys: JourneyRepository = journeyRepository,
  ) {}

  initialize(module: FinancialModule): Promise<ServiceResult<FinancialAccountRecord[]>> {
    const inFlight = this.initializingModules.get(module);
    if (inFlight) return inFlight;
    const initialization = executeService('account.initialize', async () => {
      if (!this.initializedModules.has(module)) {
        for (const name of ['Efectivo', 'Nequi']) await this.getOrCreate(module, name);
        this.initializedModules.add(module);
      }
      return this.accounts.findByModule(module);
    });
    this.initializingModules.set(module, initialization);
    void initialization.then((result) => {
      if (this.initializingModules.get(module) === initialization) this.initializingModules.delete(module);
      if (!result.ok) this.initializedModules.delete(module);
    });
    return initialization;
  }

  list(module: FinancialModule, options?: { includeDeleted?: boolean }): Promise<ServiceResult<FinancialAccountRecord[]>> {
    return executeService('account.list', async () => {
      await this.initialize(module).then((result) => {
        if (!result.ok) throw result.error;
      });
      return this.accounts.findByModule(module, options?.includeDeleted);
    });
  }

  create(module: FinancialModule, name: string): Promise<ServiceResult<FinancialAccountRecord>> {
    return executeService('account.create', async () => {
      const clean = cleanName(name);
      if (!clean) throw new ServiceError('VALIDATION', 'El nombre de la cuenta es obligatorio.');
      if (await this.accounts.findByName(module, clean)) throw new ServiceError('CONFLICT', 'Ya existe una cuenta con ese nombre en este mÃ³dulo.');
      return this.getOrCreate(module, clean);
    });
  }

  updateName(id: string, name: string): Promise<ServiceResult<FinancialAccountRecord>> {
    return executeService('account.updateName', async () => {
      const current = await this.accounts.findById(id);
      if (!current) throw new ServiceError('NOT_FOUND', 'No se encontrÃ³ la cuenta.');
      const clean = cleanName(name);
      if (!clean) throw new ServiceError('VALIDATION', 'El nombre de la cuenta es obligatorio.');
      const duplicate = await this.accounts.findByName(current.module, clean);
      if (duplicate && duplicate.id !== id) throw new ServiceError('CONFLICT', 'Ya existe una cuenta con ese nombre en este mÃ³dulo.');
      return this.accounts.update(id, { name: clean });
    });
  }

  delete(id: string): Promise<ServiceResult<FinancialAccountRecord>> {
    return executeService('account.delete', async () => {
      const current = await this.accounts.findById(id);
      if (!current) throw new ServiceError('NOT_FOUND', 'No se encontrÃ³ la cuenta.');
      if (['efectivo', 'nequi'].includes(current.name.toLocaleLowerCase('es-CO'))) {
        throw new ServiceError('VALIDATION', 'Las cuentas iniciales no se pueden eliminar.');
      }
      const [personal, business, transfers, savings] = await Promise.all([
        this.personal.findAll({ includeDeleted: true }),
        this.business.findAll({ includeDeleted: true }),
        this.transfers.findAll({ includeDeleted: true }),
        this.savings.findAll({ includeDeleted: true }),
      ]);
      const referenced = [...personal, ...business, ...savings].some((record) => record.accountId === id) ||
        transfers.some((transfer) => transfer.sourceAccountId === id || transfer.destinationAccountId === id);
      if (referenced) throw new ServiceError('CONFLICT', 'No se puede eliminar una cuenta que conserva movimientos.');
      return this.accounts.delete(id);
    });
  }

  restore(id: string): Promise<ServiceResult<FinancialAccountRecord>> {
    return executeService('account.restore', () => this.accounts.restore(id));
  }

  balances(module: FinancialModule): Promise<ServiceResult<AccountBalanceSnapshot>> {
    return executeService('account.balances', async () => {
      const initialized = await this.initialize(module);
      if (!initialized.ok) throw initialized.error;
      const [personal, business, transfers, savings, settings, journeys] = await Promise.all([
        this.personal.findAll(), this.business.findAll(), this.transfers.findAll(),
        module === 'business' ? this.savings.findAll() : Promise.resolve([]), this.settings.findById('global'),
        this.journeys.findAll(),
      ]);
      return calculateAccountBalances(module, initialized.value, personal, business, transfers, savings, settings ?? undefined, journeys);
    });
  }

  private async getOrCreate(module: FinancialModule, name: string): Promise<FinancialAccountRecord> {
    const timestamp = this.now().toISOString();
    const clean = cleanName(name);
    const normalizedName = normalizeFinancialAccountName(clean);
    return this.accounts.ensureExists(module, normalizedName, timestamp, () => {
      const parsed = financialAccountSchema.safeParse({
        id: this.identity.createId(), module, name: clean, normalizedName,
        createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
      });
      if (!parsed.success) throw new ServiceError('VALIDATION', 'Los datos de la cuenta no son válidos.', { cause: parsed.error });
      return parsed.data;
    });
  }
}

export const financialAccountService = new FinancialAccountService();
