import { loadData } from '../database/storage';
import type { AppData, AppSettings, LedgerSpace, Movement, MovementDraft, SavingsMovement, ThemeMode, Workday } from '../types';
import type { AccountTransferRecord, FinancialModule } from '../types/database';
import { businessMovementRepository } from '../repositories/business.repository';
import { journeyRepository } from '../repositories/journey.repository';
import { personalMovementRepository } from '../repositories/personal.repository';
import { savingRepository } from '../repositories/saving.repository';
import { classificationRuleRepository } from '../repositories/classificationRule.repository';
import { accountTransferService } from './accountTransfer.service';
import { capitalService } from './capital.service';
import { dailyGoalService } from './dailyGoal.service';
import { financialAccountService } from './financialAccount.service';
import { journeyService } from './journey.service';
import { legacyDataService } from './legacyData.service';
import { personalService } from './personal.service';
import { businessService } from './business.service';
import { savingService } from './saving.service';
import { settingsService } from './settings.service';
import { classificationService } from './classification.service';
import { validateFinancialIntegrity } from './ledger';
import { financeUnitOfWorkRepository } from '../repositories/finance-unit-of-work.repository';
import type { ServiceResult } from './serviceResult';

function serviceValue<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

export class FinanceApplicationService {
  async load(): Promise<AppData> {
    const legacy = await loadData();
    serviceValue(await legacyDataService.import(legacy));
    return this.snapshot();
  }

  async snapshot(): Promise<AppData> {
    const [settings, personal, business, journeys, savings, rules, personalBalances, businessBalances, dailyGoal, capital, personalTransfers, businessTransfers] = await Promise.all([
      settingsService.get(), personalMovementRepository.findAll({ includeDeleted: true }),
      businessMovementRepository.findAll({ includeDeleted: true }), journeyRepository.findAll({ includeDeleted: true }),
      savingRepository.findAll({ includeDeleted: true }), classificationRuleRepository.findAll({ includeDeleted: true }),
      financialAccountService.balances('personal'), financialAccountService.balances('business'), dailyGoalService.calculate(), capitalService.calculate(),
      accountTransferService.findAll('personal', { includeDeleted: true }), accountTransferService.findAll('business', { includeDeleted: true }),
    ]);
    const allAccounts = [...serviceValue(personalBalances).accounts, ...serviceValue(businessBalances).accounts];
    const categories: AppSettings['learnedCategories'] = { personal: {}, deliveries: {} };
    for (const rule of rules) {
      categories.personal[rule.keyword] = rule.category;
      categories.deliveries[rule.keyword] = rule.category;
    }
    const settingsValue = serviceValue(settings);
    const movements: Movement[] = [
      ...personal.map((record) => ({
        id: record.id, space: 'personal' as const, kind: record.type, amountCOP: record.amount,
        description: record.description, occurredAt: record.date, paymentMethod: record.paymentMethod,
        accountId: record.accountId, category: record.detectedCategory, deliveryCount: 0, workdayId: null,
        deletedAt: record.deletedAt ?? null,
      })),
      ...business.map((record) => ({
        id: record.id, space: 'deliveries' as const, kind: record.type, amountCOP: record.amount,
        description: record.description, occurredAt: record.date, paymentMethod: record.paymentMethod,
        accountId: record.accountId, category: record.detectedCategory, deliveryCount: record.deliveryCount ?? 0,
        workdayId: record.journeyId, deletedAt: record.deletedAt ?? null,
      })),
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const currentBusinessBalances = Object.fromEntries(serviceValue(businessBalances).accounts.map(({ account, balance }) => [account.id, balance]));
    const workdays: Workday[] = journeys.map((journey) => ({
      id: journey.id, startedAt: journey.startTime, initialCapitalCOP: journey.initialCapital,
      initialCapitalByAccount: journey.initialCapitalByAccount,
      finalCapitalByAccount: journey.status === 'active' && !journey.deletedAt ? currentBusinessBalances : journey.finalCapitalByAccount,
      incomeByAccount: journey.incomeByAccount, expensesByAccount: journey.expensesByAccount,
      endedAt: journey.endTime, savingsTransferredCOP: journey.savingTransferred,
      deletedAt: journey.deletedAt ?? null,
    }));
    const savingMovements: SavingsMovement[] = savings.map((saving) => ({
      id: saving.id, kind: saving.type === 'deposit' ? 'deposit' : 'withdrawal', amountCOP: saving.amount,
      occurredAt: saving.date, note: saving.description, accountId: saving.accountId, deletedAt: saving.deletedAt ?? null,
    }));
    const snapshot: AppData = {
      schemaVersion: 1,
      movements,
      workdays,
      savings: savingMovements,
      settings: {
        dailyGoalCOP: settingsValue.dailyGoal,
        startingCapitalCOP: settingsValue.businessInitialCapital,
        businessInitialCapitalByAccount: settingsValue.businessInitialCapitalByAccount,
        personalInitialCapitalByAccount: settingsValue.personalInitialCapitalByAccount,
        paymentMethods: [...new Set(allAccounts.map(({ account }) => account.name))],
        currency: settingsValue.currency,
        theme: settingsValue.theme,
        learnedCategories: categories,
      },
      accountBalances: {
        personal: { total: serviceValue(personalBalances).total, accounts: serviceValue(personalBalances).accounts.map(({ account, balance }) => ({ id: account.id, name: account.name, balance })) },
        deliveries: { total: serviceValue(businessBalances).total, accounts: serviceValue(businessBalances).accounts.map(({ account, balance }) => ({ id: account.id, name: account.name, balance })) },
      },
      dailyGoal: {
        current: serviceValue(dailyGoal).current, goal: serviceValue(dailyGoal).goal,
        remaining: serviceValue(dailyGoal).remaining, percentage: serviceValue(dailyGoal).percentage,
        completed: serviceValue(dailyGoal).completed, excess: serviceValue(dailyGoal).excess,
      },
      businessProfitCOP: serviceValue(capital).totalProfit,
      transfers: {
        personal: serviceValue(personalTransfers).map((transfer) => ({ ...transfer, module: 'personal' as const })),
        deliveries: serviceValue(businessTransfers).map((transfer) => ({ ...transfer, module: 'business' as const })),
      },
    };
    snapshot.integrityIssues = validateFinancialIntegrity(snapshot);
    if (snapshot.integrityIssues.length) console.error('Se detectaron inconsistencias financieras:', snapshot.integrityIssues);
    return snapshot;
  }

  async createMovement(draft: MovementDraft): Promise<string | null> {
    const input = {
      type: draft.kind, amount: draft.amountCOP, description: draft.description,
      paymentMethod: draft.paymentMethod, accountId: draft.accountId,
      detectedCategory: draft.category, date: draft.occurredAt,
      deliveryCount: draft.deliveryCount,
    };
    const result = draft.space === 'personal'
      ? await personalService.create(input)
      : await businessService.create(input);
    if (!result.ok) return result.error.message;
    await this.learnManualCategory(draft);
    await this.recalculateBusiness(draft.space === 'deliveries', draft.occurredAt);
    return null;
  }

  async updateMovement(id: string, draft: MovementDraft): Promise<string | null> {
    const input = {
      type: draft.kind, amount: draft.amountCOP, description: draft.description,
      paymentMethod: draft.paymentMethod, accountId: draft.accountId,
      detectedCategory: draft.category, date: draft.occurredAt,
      deliveryCount: draft.deliveryCount,
    };
    const result = draft.space === 'personal'
      ? await personalService.update(id, input)
      : await businessService.update(id, input);
    if (!result.ok) return result.error.message;
    await this.learnManualCategory(draft);
    await this.recalculateBusiness(draft.space === 'deliveries', draft.occurredAt);
    return null;
  }

  async deleteMovement(id: string, space: LedgerSpace): Promise<string | null> {
    const result = space === 'personal' ? await personalService.delete(id) : await businessService.delete(id);
    if (!result.ok) return result.error.message;
    await this.recalculateBusiness(space === 'deliveries');
    return null;
  }

  async restoreMovement(id: string, space: LedgerSpace): Promise<string | null> {
    const result = space === 'personal' ? await personalService.restore(id) : await businessService.restore(id);
    if (!result.ok) return result.error.message;
    await this.recalculateBusiness(space === 'deliveries');
    return null;
  }

  async startJourney(initialCapitalCOP: number) {
    const result = await journeyService.start(initialCapitalCOP);
    return result.ok ? null : result.error.message;
  }

  async closeJourney(amount: number, description: string, accountId?: string): Promise<string | null> {
    const result = await journeyService.close({ savingTransferred: amount, savingDescription: description, savingAccountId: accountId });
    return result.ok ? null : result.error.message;
  }

  async savingWithdrawal(amount: number, description: string, accountId?: string): Promise<string | null> {
    const result = await savingService.withdraw({ amount, description, accountId });
    if (!result.ok) return result.error.message;
    return null;
  }

  async savingDeposit(amount: number, description: string, accountId?: string): Promise<string | null> {
    const result = await savingService.deposit({ amount, description, accountId });
    return result.ok ? null : result.error.message;
  }

  async deleteSaving(id: string): Promise<string | null> {
    const result = await savingService.delete(id);
    return result.ok ? null : result.error.message;
  }

  async restoreSaving(id: string): Promise<string | null> {
    const result = await savingService.restore(id);
    return result.ok ? null : result.error.message;
  }

  async updateSettings(settings: AppSettings): Promise<string | null> {
    const result = await settingsService.update({
      dailyGoal: settings.dailyGoalCOP,
      businessInitialCapital: settings.startingCapitalCOP,
      businessInitialCapitalByAccount: settings.businessInitialCapitalByAccount,
      personalInitialCapitalByAccount: settings.personalInitialCapitalByAccount,
      currency: settings.currency,
      theme: settings.theme,
    });
    if (!result.ok) return result.error.message;
    return null;
  }

  async setTheme(theme: ThemeMode): Promise<string | null> {
    const result = await settingsService.setTheme(theme);
    return result.ok ? null : result.error.message;
  }

  async restoreBackup(data: AppData): Promise<string | null> {
    const result = await legacyDataService.import(data, true);
    return result.ok ? null : result.error.message;
  }

  async clearTodayRecords(): Promise<string | null> {
    try {
      await financeUnitOfWorkRepository.clearTodayRecords();
      serviceValue(await capitalService.recalculate());
      serviceValue(await dailyGoalService.calculate());
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudieron limpiar los registros de hoy.';
    }
  }

  async createAccount(module: FinancialModule, name: string): Promise<string | null> {
    const result = await financialAccountService.create(module, name);
    return result.ok ? null : result.error.message;
  }

  async createTransfer(input: { module: FinancialModule; sourceAccountId: string; destinationAccountId: string; amount: number; description: string; date: string }): Promise<string | null> {
    const result = await accountTransferService.create(input);
    return result.ok ? null : result.error.message;
  }

  async deleteTransfer(id: string): Promise<string | null> {
    const result = await accountTransferService.delete(id);
    return result.ok ? null : result.error.message;
  }

  async restoreTransfer(id: string): Promise<string | null> {
    const result = await accountTransferService.restore(id);
    return result.ok ? null : result.error.message;
  }

  async listTransfers(module: FinancialModule): Promise<AccountTransferRecord[]> {
    return serviceValue(await accountTransferService.findAll(module, { includeDeleted: true }));
  }

  private async recalculateBusiness(affectsBusiness: boolean, date?: string): Promise<void> {
    if (!affectsBusiness) return;
    serviceValue(await capitalService.recalculate());
    serviceValue(await dailyGoalService.calculate(date ? new Date(date) : new Date()));
  }

  private async learnManualCategory(draft: MovementDraft): Promise<void> {
    if (draft.kind !== 'expense' || !draft.category.trim()) return;
    const known = await classificationService.classify(draft.description);
    if (known.ok && known.value?.category === draft.category.trim()) return;
    await classificationService.learn(draft.description, draft.category);
  }
}

export const financeApplicationService = new FinanceApplicationService();
