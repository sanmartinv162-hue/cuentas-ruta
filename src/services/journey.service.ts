import { journeyRepository, type JourneyRepository } from '../repositories/journey.repository';
import { financeUnitOfWorkRepository, type FinanceUnitOfWorkRepository } from '../repositories/finance-unit-of-work.repository';
import { journeySchema } from '../models/journey';
import { savingSchema } from '../models/saving';
import type { JourneyRecord } from '../types/database';
import { identityProvider, type IdentityProvider } from '../utils/identity';
import { logger } from '../utils/logger';
import { capitalService, type CapitalService } from './capital.service';
import { dailyGoalService, type DailyGoalService } from './dailyGoal.service';
import { settingsService, type SettingsService } from './settings.service';
import { financialAccountService, type FinancialAccountService } from './financialAccount.service';
import { executeService, ServiceError, unwrapServiceResult, type ServiceResult } from './serviceResult';

export interface CloseJourneyInput {
  savingTransferred: number;
  savingDescription?: string;
  savingAccountId?: string;
}

export class JourneyService {
  constructor(
    private readonly unitOfWork: FinanceUnitOfWorkRepository = financeUnitOfWorkRepository,
    private readonly journeys: JourneyRepository = journeyRepository,
    private readonly settings: SettingsService = settingsService,
    private readonly capital: CapitalService = capitalService,
    private readonly dailyGoal: DailyGoalService = dailyGoalService,
    private readonly identity: IdentityProvider = identityProvider,
    private readonly now: () => Date = () => new Date(),
    private readonly accounts: FinancialAccountService = financialAccountService,
  ) {}

  start(initialCapitalCOP?: number): Promise<ServiceResult<JourneyRecord>> {
    return executeService('journey.start', async () => {
      const existing = (await this.journeys.findAll()).filter((journey) => journey.status === 'active');
      if (existing.length) throw new ServiceError('CONFLICT', 'Ya existe una jornada activa.');
      const [settings, accountSnapshot] = await Promise.all([
        this.settings.get().then(unwrapServiceResult),
        this.accounts.balances('business').then(unwrapServiceResult),
      ]);
      const selectedCapital = initialCapitalCOP ?? accountSnapshot.total;
      if (!Number.isSafeInteger(selectedCapital) || selectedCapital <= 0) throw new ServiceError('VALIDATION', 'El capital para iniciar debe ser mayor que $0.');
      if (selectedCapital > accountSnapshot.total) throw new ServiceError('INSUFFICIENT_FUNDS', `El capital inicial no puede superar el disponible de ${accountSnapshot.total} COP.`);
      const timestamp = this.now().toISOString();
      const initialCapitalByAccount = Object.fromEntries(accountSnapshot.accounts.map(({ account, balance }) => [account.id, balance]));
      const journey: JourneyRecord = {
        id: this.identity.createId(),
        startTime: timestamp,
        endTime: null,
        initialCapital: selectedCapital,
        initialCapitalByAccount,
        finalCapital: accountSnapshot.total,
        finalCapitalByAccount: initialCapitalByAccount,
        income: 0,
        incomeByAccount: Object.fromEntries(accountSnapshot.accounts.map(({ account }) => [account.id, 0])),
        expenses: 0,
        expensesByAccount: Object.fromEntries(accountSnapshot.accounts.map(({ account }) => [account.id, 0])),
        profit: 0,
        savingTransferred: 0,
        goalAmount: settings.dailyGoal,
        goalProgress: 0,
        goalReached: false,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      const parsed = journeySchema.safeParse(journey);
      if (!parsed.success) throw new ServiceError('VALIDATION', 'No se pudo validar el inicio de jornada.', { cause: parsed.error });
      return this.journeys.create(parsed.data);
    });
  }

  close(input: CloseJourneyInput): Promise<ServiceResult<JourneyRecord>> {
    return executeService('journey.close', async () => {
      if (!Number.isSafeInteger(input.savingTransferred) || input.savingTransferred < 0) {
        throw new ServiceError('VALIDATION', 'El valor transferido al ahorro debe ser un entero no negativo.');
      }
      const closed = await this.unitOfWork.withJourneyCloseTransaction(async (unit) => {
          const active = await unit.activeJourneys();
          if (active.length !== 1) throw new ServiceError(active.length ? 'CONFLICT' : 'NOT_FOUND', active.length ? 'Hay varias jornadas activas.' : 'No hay una jornada activa para cerrar.');
          const journey = active[0];
          const activeMovements = await unit.movementsForJourney(journey.id);
          const income = activeMovements.filter((movement) => movement.type === 'income').reduce((sum, movement) => sum + movement.amount, 0);
          const expenses = activeMovements.filter((movement) => movement.type === 'expense').reduce((sum, movement) => sum + movement.amount, 0);
          const profit = income - expenses;
          const timestamp = this.now().toISOString();
          const accounts = await unit.accounts();
          const cashAccount = accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === 'efectivo') ?? accounts[0];
          if (!cashAccount) throw new ServiceError('DATABASE', 'No hay cuentas disponibles para cerrar la jornada.');
          const initialByAccount = journey.initialCapitalByAccount ?? Object.fromEntries(accounts.map((account) => [account.id, account.id === cashAccount.id ? journey.initialCapital : 0]));
          const incomeByAccount = Object.fromEntries(accounts.map((account) => [account.id, 0])) as Record<string, number>;
          const expensesByAccount = Object.fromEntries(accounts.map((account) => [account.id, 0])) as Record<string, number>;
          const accountFor = (accountId: string | undefined, paymentMethod: string) => accounts.find((account) => account.id === accountId) ??
            accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === paymentMethod.trim().toLocaleLowerCase('es-CO')) ?? cashAccount;
          for (const movement of activeMovements) {
            const account = accountFor(movement.accountId, movement.paymentMethod);
            const totals = movement.type === 'income' ? incomeByAccount : expensesByAccount;
            totals[account.id] = (totals[account.id] ?? 0) + movement.amount;
          }
          const transfers = (await unit.transfers()).filter((transfer) => transfer.date >= journey.startTime && transfer.date <= timestamp);
          const savingsDuringJourney = (await unit.savings()).filter((saving) => saving.date >= journey.startTime && saving.date <= timestamp);
          const finalCapitalByAccount = Object.fromEntries(accounts.map((account) => {
            const transferDelta = transfers.reduce((sum, transfer) => sum + (transfer.destinationAccountId === account.id ? transfer.amount : transfer.sourceAccountId === account.id ? -transfer.amount : 0), 0);
            const savingDelta = savingsDuringJourney.reduce((sum, saving) => {
              const savingAccount = accounts.find((candidate) => candidate.id === saving.accountId) ?? cashAccount;
              if (savingAccount.id !== account.id) return sum;
              return sum + (saving.type === 'deposit' ? -saving.amount : saving.amount);
            }, 0);
            return [account.id, (initialByAccount[account.id] ?? 0) + (incomeByAccount[account.id] ?? 0) - (expensesByAccount[account.id] ?? 0) + transferDelta + savingDelta];
          }));
          const beforeSaving = Object.values(finalCapitalByAccount).reduce((sum, balance) => sum + balance, 0);
          const savingAccount = accounts.find((account) => account.id === input.savingAccountId) ?? cashAccount;
          if (input.savingAccountId && !accounts.some((account) => account.id === input.savingAccountId)) throw new ServiceError('NOT_FOUND', 'La cuenta seleccionada para el ahorro no existe.');
          if (input.savingTransferred > beforeSaving || input.savingTransferred > (finalCapitalByAccount[savingAccount.id] ?? 0)) {
            throw new ServiceError('INSUFFICIENT_FUNDS', 'El ahorro transferido supera el saldo disponible en la cuenta seleccionada.');
          }
          finalCapitalByAccount[savingAccount.id] = (finalCapitalByAccount[savingAccount.id] ?? 0) - input.savingTransferred;
          const finalCapital = Object.values(finalCapitalByAccount).reduce((sum, balance) => sum + balance, 0);
          const goalProgress = journey.goalAmount > 0 ? Math.min(income / journey.goalAmount * 100, 100) : 0;
          const updated: JourneyRecord = {
            ...journey,
            endTime: timestamp,
            income,
            incomeByAccount,
            expenses,
            expensesByAccount,
            profit,
            savingTransferred: input.savingTransferred,
            finalCapital,
            finalCapitalByAccount,
            goalProgress,
            goalReached: journey.goalAmount > 0 && income >= journey.goalAmount,
            status: 'closed',
            updatedAt: timestamp,
          };
          const parsed = journeySchema.safeParse(updated);
          if (!parsed.success) throw new ServiceError('VALIDATION', 'El cierre calculado no cumple las invariantes.', { cause: parsed.error });

          const savings = await unit.savings();
          const currentSavings = savings.reduce((sum, saving) => sum + (saving.type === 'deposit' ? saving.amount : -saving.amount), 0);
          if (currentSavings < 0) throw new ServiceError('DATABASE', 'El historial de ahorro tiene un saldo negativo.');

          if (input.savingTransferred > 0) {
            const saving = savingSchema.safeParse({
              id: this.identity.createId(),
              type: 'deposit',
              amount: input.savingTransferred,
              accountId: savingAccount.id,
              description: input.savingDescription?.trim() || `Ahorro de jornada ${journey.startTime.slice(0, 10)}`,
              date: timestamp,
              balanceAfter: currentSavings + input.savingTransferred,
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: null,
            });
            if (!saving.success) throw new ServiceError('VALIDATION', 'La transferencia al ahorro no es válida.', { cause: saving.error });
            await unit.addSaving(saving.data);
          }
          await unit.setBusinessSaving(currentSavings + input.savingTransferred, timestamp);
          await unit.closeJourney(parsed.data);
          return parsed.data;
      });

      const recalculatedCapital = await this.capital.recalculate();
      if (!recalculatedCapital.ok) logger.warn('journey.close.capitalRecalculationDeferred', { journeyId: closed.id });
      const dailyResult = await this.dailyGoal.calculate(this.now());
      if (!dailyResult.ok) logger.warn('journey.close.dailyGoalRecalculationDeferred', { journeyId: closed.id });
      return closed;
    });
  }

  active(): Promise<ServiceResult<JourneyRecord | null>> {
    return executeService('journey.active', async () => {
      const active = (await this.journeys.findAll()).filter((journey) => journey.status === 'active');
      if (active.length > 1) throw new ServiceError('CONFLICT', 'Hay más de una jornada activa.');
      return active[0] ?? null;
    });
  }

  history(): Promise<ServiceResult<JourneyRecord[]>> {
    return executeService('journey.history', () => this.journeys.findAll());
  }
}

export const journeyService = new JourneyService();
