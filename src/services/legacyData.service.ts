import { financeUnitOfWorkRepository, type FinanceUnitOfWorkRepository, type LegacyImportBatch } from '../repositories/finance-unit-of-work.repository';
import { businessMovementSchema } from '../models/businessMovement';
import { journeySchema } from '../models/journey';
import { personalMovementSchema } from '../models/personalMovement';
import { savingSchema } from '../models/saving';
import { settingsSchema } from '../models/settings';
import { financialAccountSchema } from '../models/financialAccount';
import { normalizeFinancialAccountName } from '../models/financialAccount';
import { accountTransferSchema } from '../models/accountTransfer';
import type { AppData, Movement, Workday } from '../types';
import type { BusinessMovementRecord, ClassificationRuleRecord, FinancialAccountRecord, JourneyRecord, PersonalMovementRecord, SavingRecord, SettingsRecord } from '../types/database';
import { identityProvider, type IdentityProvider } from '../utils/identity';
import { executeService, ServiceError, type ServiceResult } from './serviceResult';
import { calculateAccountBalances, financialAccountService, type FinancialAccountService } from './financialAccount.service';

function normalizedAccountName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('es-CO');
}

interface PreparedBackup {
  data: AppData;
  personalAccounts: FinancialAccountRecord[];
  businessAccounts: FinancialAccountRecord[];
}

function totals(movements: Movement[], journeyId: string): { income: number; expenses: number } {
  const linked = movements.filter((movement) => movement.space === 'deliveries' && !movement.internalTransfer && movement.workdayId === journeyId);
  return {
    income: linked.filter((movement) => movement.kind === 'income').reduce((sum, movement) => sum + movement.amountCOP, 0),
    expenses: linked.filter((movement) => movement.kind === 'expense').reduce((sum, movement) => sum + movement.amountCOP, 0),
  };
}

export class LegacyDataService {
  constructor(
    private readonly unitOfWork: FinanceUnitOfWorkRepository = financeUnitOfWorkRepository,
    private readonly accounts: FinancialAccountService = financialAccountService,
    private readonly identity: IdentityProvider = identityProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  import(data: AppData, replaceExisting = false): Promise<ServiceResult<boolean>> {
    return executeService('legacyData.import', async () => {
      const timestamp = this.now().toISOString();
      const prepared = replaceExisting ? this.prepareBackup(data, timestamp) : null;
      const source = prepared?.data ?? data;
      const [personalAccountsResult, businessAccountsResult] = replaceExisting
        ? [null, null] as const
        : await Promise.all([this.accounts.initialize('personal'), this.accounts.initialize('business')]);
      if (personalAccountsResult && !personalAccountsResult.ok) throw personalAccountsResult.error;
      if (businessAccountsResult && !businessAccountsResult.ok) throw businessAccountsResult.error;
      const personalAccounts = replaceExisting
        ? prepared!.personalAccounts
        : [...personalAccountsResult!.value];
      const businessAccounts = replaceExisting
        ? prepared!.businessAccounts
        : [...businessAccountsResult!.value];
      if (!replaceExisting) {
        for (const name of source.settings.paymentMethods) {
          for (const [module, list] of [['personal', personalAccounts], ['business', businessAccounts]] as const) {
            if (list.some((account) => account.name.toLocaleLowerCase('es-CO') === name.trim().toLocaleLowerCase('es-CO'))) continue;
            const created = await this.accounts.create(module, name);
            if (!created.ok) throw created.error;
            list.push(created.value);
          }
        }
      }
      const businessCash = this.accountByName(businessAccounts, 'Efectivo');
      const deviceId = await this.identity.getDeviceId();
      const settings = this.createSettings(source, businessAccounts, timestamp);
      const personalMovements = source.movements.filter((item) => item.space === 'personal' && !item.internalTransfer).map((movement) => this.createPersonalMovement(movement, personalAccounts, deviceId, timestamp));
      const businessInputs = source.movements.filter((item) => item.space === 'deliveries' && !item.internalTransfer);
      const orphanJourneys = new Map<string, string>();
      for (const movement of businessInputs) {
        if (!movement.workdayId) {
          const day = movement.occurredAt.slice(0, 10);
          if (!orphanJourneys.has(day)) orphanJourneys.set(day, this.identity.createId());
        }
      }
      const businessMovements: BusinessMovementRecord[] = businessInputs.map((movement) => {
        const dateKey = movement.occurredAt.slice(0, 10);
        const journeyId = movement.workdayId ?? orphanJourneys.get(dateKey)!;
        return this.createBusinessMovement(movement, journeyId, businessAccounts, deviceId, timestamp);
      });
      const workdays = [...source.workdays];
      for (const [day, id] of orphanJourneys) {
        const first = businessInputs.find((movement) => !movement.workdayId && movement.occurredAt.slice(0, 10) === day)!;
        workdays.push({ id, startedAt: first.occurredAt, endedAt: first.occurredAt, initialCapitalCOP: 0, savingsTransferredCOP: 0 });
      }
      const journeys = workdays.map((workday) => this.createJourney(workday, source.movements, source.settings.dailyGoalCOP, businessAccounts, timestamp));
      const savings = this.createSavings(source, businessCash, timestamp);
      const rules = this.createLearnedRules(source, timestamp);
      const allAccounts = [...personalAccounts, ...businessAccounts];
      const transferSources = source.transfers ? [...source.transfers.personal, ...source.transfers.deliveries] : [];
      const transfers = [...new Map(transferSources.map((transfer) => [transfer.id, transfer])).values()].map((transfer) => {
        const parsed = accountTransferSchema.safeParse({
          id: transfer.id, module: transfer.module,
          sourceModule: transfer.sourceModule ?? transfer.module,
          destinationModule: transfer.destinationModule ?? transfer.module,
          sourceAccountId: transfer.sourceAccountId, destinationAccountId: transfer.destinationAccountId,
          amount: transfer.amount, description: transfer.description, date: transfer.date,
          createdAt: transfer.date, updatedAt: timestamp, deletedAt: transfer.deletedAt ?? null,
        });
        if (!parsed.success) throw new ServiceError('VALIDATION', `La transferencia ${transfer.id} no es válida.`, { cause: parsed.error });
        const sourceModule = parsed.data.sourceModule ?? parsed.data.module;
        const destinationModule = parsed.data.destinationModule ?? parsed.data.module;
        if (!allAccounts.some((account) => account.id === parsed.data.sourceAccountId && account.module === sourceModule) ||
            !allAccounts.some((account) => account.id === parsed.data.destinationAccountId && account.module === destinationModule)) {
          throw new ServiceError('VALIDATION', `No se encontraron las cuentas de la transferencia ${transfer.id}.`);
        }
        return parsed.data;
      });
      const batch: LegacyImportBatch = {
        settings,
        accounts: [...personalAccounts, ...businessAccounts],
        personalMovements,
        businessMovements,
        journeys,
        savings,
        classificationRules: rules,
        transfers,
      };
      if (replaceExisting) {
        this.assertBackupBalances(source, batch);
        await this.unitOfWork.restoreBackup(batch);
        return true;
      }
      return this.unitOfWork.importLegacyData(batch);
    });
  }

  private prepareBackup(data: AppData, timestamp: string): PreparedBackup {
    const idMaps: Record<'personal' | 'business', Map<string, string>> = { personal: new Map(), business: new Map() };
    const accounts: Record<'personal' | 'business', FinancialAccountRecord[]> = { personal: [], business: [] };
    const byName: Record<'personal' | 'business', Map<string, FinancialAccountRecord>> = { personal: new Map(), business: new Map() };
    const mergedBalances: Record<'personal' | 'business', Map<string, number>> = { personal: new Map(), business: new Map() };
    const spaces = { personal: 'personal', business: 'deliveries' } as const;

    for (const module of ['personal', 'business'] as const) {
      const snapshot = data.accountBalances?.[spaces[module]];
      const listed = snapshot?.accounts ?? [];
      if (snapshot && listed.reduce((sum, account) => sum + account.balance, 0) !== snapshot.total) {
        throw new ServiceError('VALIDATION', `El capital total del respaldo no coincide con sus cuentas de ${module}.`);
      }
      for (const source of listed) {
        if (!Number.isSafeInteger(source.balance) || source.balance < 0 || !source.name.trim()) {
          throw new ServiceError('VALIDATION', `La cuenta ${source.name} tiene un saldo inválido en el respaldo.`);
        }
        const key = normalizedAccountName(source.name);
        let canonical = byName[module].get(key);
        if (!canonical) {
          const clean = source.name.trim().replace(/\s+/g, ' ');
          const parsed = financialAccountSchema.safeParse({ id: source.id, module, name: clean, normalizedName: normalizeFinancialAccountName(clean), createdAt: timestamp, updatedAt: timestamp, deletedAt: null });
          if (!parsed.success) throw new ServiceError('VALIDATION', `La cuenta ${source.name} no es válida.`, { cause: parsed.error });
          canonical = parsed.data;
          byName[module].set(key, canonical);
          accounts[module].push(canonical);
        }
        const mappedId = idMaps[module].get(source.id);
        if (mappedId && mappedId !== canonical.id) throw new ServiceError('VALIDATION', `El ID ${source.id} representa cuentas diferentes en el respaldo.`);
        idMaps[module].set(source.id, canonical.id);
        mergedBalances[module].set(key, (mergedBalances[module].get(key) ?? 0) + source.balance);
      }
      const names = [
        ...data.settings.paymentMethods,
        'Efectivo', 'Nequi',
        ...data.movements.filter((movement) => movement.space === spaces[module]).map((movement) => movement.paymentMethod),
      ];
      for (const value of names) {
        const name = value.trim().replace(/\s+/g, ' ');
        const key = normalizedAccountName(name);
        if (!key || byName[module].has(key)) continue;
        const parsed = financialAccountSchema.safeParse({ id: this.identity.createId(), module, name, normalizedName: normalizeFinancialAccountName(name), createdAt: timestamp, updatedAt: timestamp, deletedAt: null });
        if (!parsed.success) throw new ServiceError('VALIDATION', `La cuenta ${name} no es válida.`, { cause: parsed.error });
        byName[module].set(key, parsed.data);
        accounts[module].push(parsed.data);
        mergedBalances[module].set(key, 0);
      }
    }

    const resolveAccount = (module: 'personal' | 'business', id?: string, name?: string): string | undefined => {
      const mapped = id ? idMaps[module].get(id) : undefined;
      if (mapped) return mapped;
      const found = name ? byName[module].get(normalizedAccountName(name)) : undefined;
      if (found && id) idMaps[module].set(id, found.id);
      return found?.id;
    };
    const remapValues = (values: Record<string, number> | undefined, module: 'personal' | 'business', label: string): Record<string, number> | undefined => {
      if (!values) return undefined;
      const result: Record<string, number> = {};
      for (const [sourceId, amount] of Object.entries(values)) {
        const targetId = resolveAccount(module, sourceId);
        if (!targetId || !Number.isSafeInteger(amount) || amount < 0) throw new ServiceError('VALIDATION', `${label} contiene una cuenta o saldo inválido.`);
        result[targetId] = (result[targetId] ?? 0) + amount;
      }
      return result;
    };

    const movements = data.movements.map((movement) => {
      const module = movement.space === 'personal' ? 'personal' : 'business';
      const accountId = resolveAccount(module, movement.accountId, movement.paymentMethod);
      if (!accountId) throw new ServiceError('VALIDATION', `El movimiento ${movement.id} no tiene una cuenta válida; no se importó el respaldo.`);
      const account = accounts[module].find((candidate) => candidate.id === accountId)!;
      return { ...movement, accountId, paymentMethod: account.name };
    });
    const savings = data.savings.map((saving) => {
      const accountId = saving.accountId ? resolveAccount('business', saving.accountId) : resolveAccount('business', undefined, 'Efectivo');
      if (!accountId) throw new ServiceError('VALIDATION', `El ahorro ${saving.id} referencia una cuenta inexistente.`);
      return { ...saving, accountId };
    });
    const transfers = data.transfers ? (() => {
      const sourceRecords = [...data.transfers.personal, ...data.transfers.deliveries];
      const uniqueRecords = [...new Map(sourceRecords.map((transfer) => [transfer.id, transfer])).values()];
      const mapped = uniqueRecords.map((transfer) => {
        const sourceModule = transfer.sourceModule ?? transfer.module;
        const destinationModule = transfer.destinationModule ?? transfer.module;
        const sourceAccountId = resolveAccount(sourceModule, transfer.sourceAccountId);
        const destinationAccountId = resolveAccount(destinationModule, transfer.destinationAccountId);
        if (!sourceAccountId || !destinationAccountId) throw new ServiceError('VALIDATION', `La transferencia ${transfer.id} referencia una cuenta inexistente.`);
        return { ...transfer, sourceModule, destinationModule, sourceAccountId, destinationAccountId };
      });
      return {
        personal: mapped.filter((transfer) => (transfer.sourceModule ?? transfer.module) === 'personal' || (transfer.destinationModule ?? transfer.module) === 'personal'),
        deliveries: mapped.filter((transfer) => (transfer.sourceModule ?? transfer.module) === 'business' || (transfer.destinationModule ?? transfer.module) === 'business'),
      };
    })() : undefined;

    const workdays: Workday[] = data.workdays.map((workday) => ({
      ...workday,
      initialCapitalByAccount: remapValues(workday.initialCapitalByAccount, 'business', `La jornada ${workday.id}`),
      finalCapitalByAccount: remapValues(workday.finalCapitalByAccount, 'business', `La jornada ${workday.id}`),
      incomeByAccount: remapValues(workday.incomeByAccount, 'business', `La jornada ${workday.id}`),
      expensesByAccount: remapValues(workday.expensesByAccount, 'business', `La jornada ${workday.id}`),
    }));
    if (new Set(workdays.map((workday) => workday.id)).size !== workdays.length) throw new ServiceError('VALIDATION', 'El respaldo contiene IDs de jornada duplicados.');
    if (workdays.filter((workday) => workday.endedAt === null).length > 1) throw new ServiceError('VALIDATION', 'El respaldo contiene más de una jornada abierta.');

    const unresolved = new Map<string, Workday>();
    const allWorkdays = [...workdays];
    for (const movement of movements.filter((item) => item.space === 'deliveries')) {
      if (movement.workdayId && workdays.some((workday) => workday.id === movement.workdayId)) continue;
      const movementTime = new Date(movement.occurredAt).getTime();
      if (!Number.isFinite(movementTime)) throw new ServiceError('VALIDATION', `El movimiento ${movement.id} tiene fecha inválida y no se puede vincular a una jornada.`);
      const day = movement.occurredAt.slice(0, 10);
      const matches = allWorkdays.filter((workday) => workday.startedAt.slice(0, 10) === day && new Date(workday.startedAt).getTime() <= movementTime &&
        (workday.endedAt === null || new Date(workday.endedAt).getTime() >= movementTime));
      if (matches.length === 1) {
        movement.workdayId = matches[0].id;
        continue;
      }
      if (matches.length > 1) throw new ServiceError('VALIDATION', `El movimiento ${movement.id} coincide con varias jornadas y se marcó como inconsistente.`);
      const key = movement.workdayId ? `id:${movement.workdayId}` : `day:${day}`;
      let reconstructed = unresolved.get(key);
      if (!reconstructed) {
        const candidateId = movement.workdayId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(movement.workdayId) && !allWorkdays.some((workday) => workday.id === movement.workdayId)
          ? movement.workdayId : this.identity.createId();
        const dayOpening = data.settings.businessInitialCapitalByAccount ?? {};
        const initialCapitalCOP = Object.values(dayOpening).reduce((sum, value) => sum + value, 0) || data.settings.startingCapitalCOP;
        reconstructed = { id: candidateId, startedAt: movement.occurredAt, endedAt: movement.occurredAt, initialCapitalCOP, savingsTransferredCOP: 0 };
        unresolved.set(key, reconstructed);
        allWorkdays.push(reconstructed);
      }
      if (movement.occurredAt < reconstructed.startedAt) reconstructed.startedAt = movement.occurredAt;
      if (!reconstructed.endedAt || movement.occurredAt > reconstructed.endedAt) reconstructed.endedAt = movement.occurredAt;
      movement.workdayId = reconstructed.id;
    }

    const businessInitialCapitalByAccount = remapValues(data.settings.businessInitialCapitalByAccount, 'business', 'El capital inicial');
    const personalInitialCapitalByAccount = remapValues(data.settings.personalInitialCapitalByAccount, 'personal', 'El capital inicial personal');
    const normalized: AppData = {
      ...data,
      movements,
      savings,
      workdays: allWorkdays,
      settings: { ...data.settings, businessInitialCapitalByAccount, personalInitialCapitalByAccount },
      accountBalances: data.accountBalances ? {
        personal: { total: data.accountBalances.personal.total, accounts: accounts.personal.map((account) => ({ id: account.id, name: account.name, balance: mergedBalances.personal.get(normalizedAccountName(account.name)) ?? 0 })) },
        deliveries: { total: data.accountBalances.deliveries.total, accounts: accounts.business.map((account) => ({ id: account.id, name: account.name, balance: mergedBalances.business.get(normalizedAccountName(account.name)) ?? 0 })) },
      } : undefined,
      transfers,
    };
    return { data: normalized, personalAccounts: accounts.personal, businessAccounts: accounts.business };
  }

  private assertBackupBalances(data: AppData, batch: LegacyImportBatch): void {
    if (!data.accountBalances) return;
    const active = <T extends { deletedAt?: string | null }>(records: T[]) => records.filter((record) => !record.deletedAt);
    const personal = calculateAccountBalances('personal', batch.accounts.filter((account) => account.module === 'personal'), active(batch.personalMovements), active(batch.businessMovements),
      (batch.transfers ?? []).filter((transfer) => !transfer.deletedAt), [], batch.settings, active(batch.journeys));
    const business = calculateAccountBalances('business', batch.accounts.filter((account) => account.module === 'business'), active(batch.personalMovements), active(batch.businessMovements),
      (batch.transfers ?? []).filter((transfer) => !transfer.deletedAt), active(batch.savings), batch.settings, active(batch.journeys));
    if (personal.accounts.some((item) => item.balance < 0) || business.accounts.some((item) => item.balance < 0) ||
        personal.total !== data.accountBalances.personal.total || business.total !== data.accountBalances.deliveries.total) {
      throw new ServiceError('VALIDATION', 'La conciliación del respaldo no coincide con el capital total; no se reemplazaron los datos actuales.');
    }
  }

  private createSettings(data: AppData, accounts: FinancialAccountRecord[], timestamp: string): SettingsRecord {
    const cash = this.accountByName(accounts, 'Efectivo');
    const candidate: SettingsRecord = {
      id: 'global', dailyGoal: data.settings.dailyGoalCOP, currency: data.settings.currency,
      theme: data.settings.theme, businessInitialCapital: data.settings.startingCapitalCOP,
      businessInitialCapitalByAccount: data.settings.businessInitialCapitalByAccount ?? { [cash.id]: data.settings.startingCapitalCOP },
      personalInitialCapitalByAccount: data.settings.personalInitialCapitalByAccount ?? {},
      businessSaving: data.savings.filter((item) => !item.deletedAt).reduce((balance, item) => balance + (item.kind === 'deposit' ? item.amountCOP : -item.amountCOP), 0),
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
    };
    const parsed = settingsSchema.safeParse(candidate);
    if (!parsed.success) throw new ServiceError('VALIDATION', 'La configuración guardada no es válida y no se importó.', { cause: parsed.error });
    return parsed.data;
  }

  private createPersonalMovement(movement: Movement, accounts: FinancialAccountRecord[], deviceId: string, timestamp: string): PersonalMovementRecord {
    const account = this.accountForLabel(accounts, movement.paymentMethod);
    const parsed = personalMovementSchema.safeParse({
      id: movement.id, accountId: movement.accountId && accounts.some((item) => item.id === movement.accountId) ? movement.accountId : account.id, type: movement.kind, amount: movement.amountCOP,
      description: movement.description, paymentMethod: account.name, detectedCategory: movement.category,
      deliveryCount: movement.deliveryCount,
      date: movement.occurredAt, createdAt: movement.occurredAt, updatedAt: timestamp, deletedAt: movement.deletedAt ?? null,
      version: 1, synced: false, syncVersion: 0, deviceId,
    });
    if (!parsed.success) throw new ServiceError('VALIDATION', `No se pudo preparar el movimiento ${movement.id} para importación.`, { cause: parsed.error });
    return parsed.data;
  }

  private createBusinessMovement(movement: Movement, journeyId: string, accounts: FinancialAccountRecord[], deviceId: string, timestamp: string): BusinessMovementRecord {
    const account = this.accountForLabel(accounts, movement.paymentMethod);
    const parsed = businessMovementSchema.safeParse({
      id: movement.id, journeyId, accountId: movement.accountId && accounts.some((item) => item.id === movement.accountId) ? movement.accountId : account.id, type: movement.kind, amount: movement.amountCOP,
      description: movement.description, paymentMethod: account.name, detectedCategory: movement.category,
      date: movement.occurredAt, createdAt: movement.occurredAt, updatedAt: timestamp, deletedAt: movement.deletedAt ?? null,
      version: 1, synced: false, syncVersion: 0, deviceId,
    });
    if (!parsed.success) throw new ServiceError('VALIDATION', `No se pudo preparar el movimiento ${movement.id} para importación.`, { cause: parsed.error });
    return parsed.data;
  }

  private createJourney(workday: Workday, movements: Movement[], goalAmount: number, accounts: FinancialAccountRecord[], timestamp: string): JourneyRecord {
    const { income, expenses } = totals(movements, workday.id);
    const profit = income - expenses;
    const savingTransferred = workday.savingsTransferredCOP;
    const goalProgress = goalAmount > 0 ? Math.min(income / goalAmount * 100, 100) : 0;
    const cash = this.accountByName(accounts, 'Efectivo');
    const initialCapitalByAccount = workday.initialCapitalByAccount ?? Object.fromEntries(accounts.map((account) => [account.id, account.id === cash.id ? workday.initialCapitalCOP : 0]));
    const finalCapitalByAccount = Object.fromEntries(accounts.map((account) => {
      const accountMovements = movements.filter((movement) => movement.space === 'deliveries' && !movement.internalTransfer && movement.workdayId === workday.id &&
        this.accountForLabel(accounts, movement.paymentMethod).id === account.id);
      const net = accountMovements.reduce((sum, movement) => sum + (movement.kind === 'income' ? movement.amountCOP : -movement.amountCOP), 0);
      return [account.id, workday.finalCapitalByAccount?.[account.id] ?? Math.max((initialCapitalByAccount[account.id] ?? 0) + net - (account.id === cash.id ? savingTransferred : 0), 0)];
    }));
    const candidate: JourneyRecord = {
      id: workday.id, startTime: workday.startedAt, endTime: workday.endedAt,
      initialCapital: workday.initialCapitalCOP, initialCapitalByAccount,
      finalCapital: Math.max(workday.initialCapitalCOP + profit - savingTransferred, 0),
      finalCapitalByAccount, income, incomeByAccount: workday.incomeByAccount ?? Object.fromEntries(accounts.map((account) => [account.id, 0])),
      expensesByAccount: workday.expensesByAccount ?? Object.fromEntries(accounts.map((account) => [account.id, 0])),
      expenses, profit, savingTransferred,
      goalAmount, goalProgress, goalReached: goalAmount > 0 && income >= goalAmount,
      status: workday.endedAt ? 'closed' : 'active', createdAt: workday.startedAt,
      updatedAt: timestamp, deletedAt: null,
    };
    if (workday.endedAt === null) candidate.finalCapital = Math.max(workday.initialCapitalCOP + profit, 0);
    const parsed = journeySchema.safeParse(candidate);
    if (!parsed.success) throw new ServiceError('VALIDATION', `No se pudo preparar la jornada ${workday.id} para importación.`, { cause: parsed.error });
    return parsed.data;
  }

  private createSavings(data: AppData, account: FinancialAccountRecord, timestamp: string): SavingRecord[] {
    let balance = 0;
    return [...data.savings].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)).map((movement) => {
      const type = movement.kind === 'deposit' ? 'deposit' : 'withdraw';
      if (!movement.deletedAt) balance += type === 'deposit' ? movement.amountCOP : -movement.amountCOP;
      if (balance < 0) throw new ServiceError('VALIDATION', 'El historial de ahorro existente tiene retiros superiores al saldo.');
      const parsed = savingSchema.safeParse({
        id: movement.id, accountId: movement.accountId ?? account.id, type, amount: movement.amountCOP,
        description: movement.note || (type === 'deposit' ? 'Ahorro de jornada' : 'Retiro de ahorro'),
        balanceAfter: balance, date: movement.occurredAt, createdAt: movement.occurredAt,
        updatedAt: timestamp, deletedAt: movement.deletedAt ?? null,
      });
      if (!parsed.success) throw new ServiceError('VALIDATION', `No se pudo preparar el movimiento de ahorro ${movement.id}.`, { cause: parsed.error });
      return parsed.data;
    });
  }

  private createLearnedRules(data: AppData, timestamp: string): ClassificationRuleRecord[] {
    return (['personal', 'deliveries'] as const).flatMap((module) => Object.entries(data.settings.learnedCategories[module]).map(([keyword, category]) => ({
      id: this.identity.createId(), keyword: keyword.trim().toLocaleLowerCase('es-CO'), category: category.trim(),
      timesUsed: 1, confidence: 0.8, createdAt: timestamp, deletedAt: null,
    })).filter((rule) => rule.keyword.length > 0 && rule.category.length > 0));
  }

  private accountForLabel(accounts: FinancialAccountRecord[], label: string): FinancialAccountRecord {
    return accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === label.trim().toLocaleLowerCase('es-CO')) ?? this.accountByName(accounts, 'Efectivo');
  }

  private accountByName(accounts: FinancialAccountRecord[], name: string): FinancialAccountRecord {
    const account = accounts.find((item) => item.name.toLocaleLowerCase('es-CO') === name.toLocaleLowerCase('es-CO'));
    if (!account) throw new ServiceError('DATABASE', `No existe la cuenta base ${name}.`);
    return account;
  }
}

export const legacyDataService = new LegacyDataService();
