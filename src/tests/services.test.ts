import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { FinanceAssistantDatabase } from '../database/db';
import { BusinessMovementRepository } from '../repositories/business.repository';
import { FinancialAccountRepository } from '../repositories/account.repository';
import { AccountTransferRepository } from '../repositories/account-transfer.repository';
import { CapitalRepository } from '../repositories/capital.repository';
import { ClassificationRuleRepository } from '../repositories/classificationRule.repository';
import { DailyGoalRepository } from '../repositories/dailyGoal.repository';
import { FinanceUnitOfWorkRepository } from '../repositories/finance-unit-of-work.repository';
import { JourneyRepository } from '../repositories/journey.repository';
import { PersonalMovementRepository } from '../repositories/personal.repository';
import { SavingRepository } from '../repositories/saving.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { createEmptyData } from '../models/defaults';
import { BusinessService } from '../services/business.service';
import { FinancialAccountService } from '../services/financialAccount.service';
import { CapitalService } from '../services/capital.service';
import { ClassificationService } from '../services/classification.service';
import { DailyGoalService } from '../services/dailyGoal.service';
import { JourneyService } from '../services/journey.service';
import { PersonalService } from '../services/personal.service';
import { SavingService } from '../services/saving.service';
import { SettingsService } from '../services/settings.service';
import { LegacyDataService } from '../services/legacyData.service';
import type { IdentityProvider } from '../utils/identity';

let database: FinanceAssistantDatabase;
let settingsRepository: SettingsRepository;
let settingsService: SettingsService;
let businessRepository: BusinessMovementRepository;
let journeyRepository: JourneyRepository;
let personalRepository: PersonalMovementRepository;
let transferRepository: AccountTransferRepository;
let unitOfWork: FinanceUnitOfWorkRepository;
let savingRepository: SavingRepository;
let identity: IdentityProvider;
let classificationService: ClassificationService;
let personalService: PersonalService;
let businessService: BusinessService;
let financialAccounts: FinancialAccountService;
let savingService: SavingService;
let capitalService: CapitalService;
let dailyGoalService: DailyGoalService;
let journeyService: JourneyService;
const now = new Date('2026-10-20T18:00:00.000Z');

beforeEach(async () => {
  database = new FinanceAssistantDatabase(`ServiceTests-${uuid()}`);
  await database.open();
  settingsRepository = new SettingsRepository(database);
  businessRepository = new BusinessMovementRepository(database);
  journeyRepository = new JourneyRepository(database);
  savingRepository = new SavingRepository(database);
  personalRepository = new PersonalMovementRepository(database);
  transferRepository = new AccountTransferRepository(database);
  const capitalRepository = new CapitalRepository(database);
  const classificationRepository = new ClassificationRuleRepository(database);
  settingsService = new SettingsService(settingsRepository, () => now);
  identity = { createId: uuid, getDeviceId: async () => 'service-test-device' };
  financialAccounts = new FinancialAccountService(
    new FinancialAccountRepository(database), personalRepository, businessRepository,
    transferRepository, savingRepository, settingsRepository, identity, () => now, journeyRepository,
  );
  classificationService = new ClassificationService(classificationRepository, identity, () => now, personalRepository, businessRepository);
  personalService = new PersonalService(personalRepository, classificationService, identity, () => now, financialAccounts);
  businessService = new BusinessService(businessRepository, journeyRepository, classificationService, identity, () => now, financialAccounts);
  unitOfWork = new FinanceUnitOfWorkRepository(database);
  savingService = new SavingService(savingRepository, unitOfWork, () => now, identity, financialAccounts);
  capitalService = new CapitalService(businessRepository, savingRepository, capitalRepository, () => now, financialAccounts);
  dailyGoalService = new DailyGoalService(new DailyGoalRepository(database), businessRepository, settingsService, () => now);
  journeyService = new JourneyService(unitOfWork, journeyRepository, settingsService, capitalService, dailyGoalService, identity, () => now, financialAccounts);
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe('servicios de dominio', () => {
  it('restaura el respaldo transaccional preservando cuentas, transferencias y eliminaciones lógicas', async () => {
    await personalService.create({ type: 'income', amount: 9_000, description: 'Dato previo', paymentMethod: 'Efectivo', date: now.toISOString() });
    const personal = await financialAccounts.list('personal');
    const business = await financialAccounts.list('business');
    expect(personal.ok && business.ok).toBe(true);
    if (!personal.ok || !business.ok) return;
    const cash = personal.value.find((account) => account.name === 'Efectivo')!;
    const nequi = personal.value.find((account) => account.name === 'Nequi')!;
    const data = createEmptyData();
    data.accountBalances = {
      personal: { total: 0, accounts: personal.value.map((account) => ({ id: account.id, name: account.name, balance: 0 })) },
      deliveries: { total: 0, accounts: business.value.map((account) => ({ id: account.id, name: account.name, balance: 0 })) },
    };
    const movementId = uuid();
    data.movements = [{ id: movementId, space: 'personal', kind: 'income', amountCOP: 1_000, description: 'Importado eliminado', occurredAt: now.toISOString(), paymentMethod: 'Efectivo', accountId: cash.id, deletedAt: now.toISOString(), category: 'Otros', deliveryCount: 0, workdayId: null }];
    data.transfers = {
      personal: [{ id: uuid(), module: 'personal', sourceAccountId: cash.id, destinationAccountId: nequi.id, amount: 500, description: 'Respaldo', date: now.toISOString(), deletedAt: now.toISOString() }],
      deliveries: [],
    };
    const result = await new LegacyDataService(unitOfWork, financialAccounts, identity, () => now).import(data, true);
    expect(result).toMatchObject({ ok: true, value: true });
    expect(await personalRepository.findAll()).toHaveLength(0);
    expect(await personalRepository.findById(movementId, true)).toMatchObject({ id: movementId, deletedAt: now.toISOString() });
    expect(await transferRepository.findAll({ includeDeleted: true })).toMatchObject([{ amount: 500, deletedAt: now.toISOString() }]);
    const restoredAccounts = await financialAccounts.list('personal');
    expect(restoredAccounts.ok && restoredAccounts.value.map((account) => account.name).sort()).toEqual(['Efectivo', 'Nequi']);
  });

  it('inicializa ajustes singleton y actualiza meta con validación', async () => {
    const initial = await settingsService.get();
    expect(initial).toMatchObject({ ok: true, value: { dailyGoal: 100_000, currency: 'COP', id: 'global' } });
    const updated = await settingsService.setDailyGoal(150_000);
    expect(updated).toMatchObject({ ok: true, value: { dailyGoal: 150_000 } });
    const invalid = await settingsService.setDailyGoal(-1);
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('clasifica movimientos personales, mantiene sync metadata y aprende correcciones', async () => {
    await personalService.create({
      type: 'income', amount: 30_000, description: 'Saldo inicial de prueba', paymentMethod: 'Nequi', date: now.toISOString(),
    });
    const created = await personalService.create({
      type: 'expense', amount: 25_000, description: 'Compra del mercado', paymentMethod: 'Nequi', date: now.toISOString(),
    });
    expect(created).toMatchObject({ ok: true, value: { detectedCategory: 'Alimentación', synced: false, syncVersion: 0, deviceId: 'service-test-device' } });
    if (!created.ok) return;
    const corrected = await personalService.correctCategory(created.value.id, 'Hogar');
    expect(corrected).toMatchObject({ ok: true, value: { detectedCategory: 'Hogar', version: 2, syncVersion: 1 } });
    const learned = await classificationService.classify('Mercado cerca de casa');
    expect(learned).toMatchObject({ ok: true, value: { category: 'Hogar' } });
  });

  it('clasifica por similitud con movimientos históricos del mismo módulo', async () => {
    await personalRepository.create({
      id: uuid(), type: 'expense', amount: 12_000, description: 'Confección de vestido artesanal',
      paymentMethod: 'Efectivo', detectedCategory: 'Arte', date: now.toISOString(), createdAt: now.toISOString(),
      updatedAt: now.toISOString(), deletedAt: null, version: 1, synced: false, syncVersion: 0, deviceId: 'history-test',
    });
    const personalMatch = await classificationService.classify('Confección artesanal urgente', 'personal');
    expect(personalMatch).toMatchObject({ ok: true, value: { category: 'Arte', confidence: 0.55 } });
    const businessMatch = await classificationService.classify('Confección artesanal urgente', 'deliveries');
    expect(businessMatch).toMatchObject({ ok: true, value: null });
  });

  it('exige jornada, calcula meta/capital y cierra con transferencia atómica al ahorro', async () => {
    const accountResult = await financialAccounts.list('business');
    expect(accountResult.ok).toBe(true);
    if (!accountResult.ok) return;
    const cashAccount = accountResult.value.find((account) => account.name === 'Efectivo')!;
    const nequiAccount = accountResult.value.find((account) => account.name === 'Nequi')!;
    await settingsService.update({ businessInitialCapital: 50_000 });
    expect(await journeyService.start(0)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await journeyService.start(50_001)).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_FUNDS' } });
    const started = await journeyService.start(20_000);
    expect(started).toMatchObject({ ok: true, value: { initialCapital: 20_000, status: 'active' } });
    if (!started.ok) return;
    expect(Object.values(started.value.initialCapitalByAccount ?? {}).reduce((sum, amount) => sum + amount, 0)).toBe(50_000);

    const created = await businessService.create({
      type: 'income', amount: 120_000, description: 'Domicilios del turno', paymentMethod: 'Efectivo', date: now.toISOString(),
    });
    expect(created).toMatchObject({ ok: true, value: { journeyId: started.value.id, deliveryCount: 1, synced: false } });
    const expense = await businessService.create({
      type: 'expense', amount: 20_000, description: 'Tanqueo gasolina', paymentMethod: 'Efectivo', date: now.toISOString(),
    });
    expect(expense).toMatchObject({ ok: true, value: { detectedCategory: 'Gasolina' } });

    const goal = await dailyGoalService.calculate(now);
    expect(goal).toMatchObject({ ok: true, value: { current: 120_000, remaining: 0, completed: true, excess: 20_000 } });
    const close = await journeyService.close({ savingTransferred: 30_000, savingDescription: 'Ahorro de hoy' });
    expect(close).toMatchObject({ ok: true, value: {
      status: 'closed', income: 120_000, incomeByAccount: { [cashAccount.id]: 120_000, [nequiAccount.id]: 0 },
      expenses: 20_000, expensesByAccount: { [cashAccount.id]: 20_000, [nequiAccount.id]: 0 },
      profit: 100_000, finalCapital: 120_000, goalReached: true,
    } });
    expect(await savingService.balance()).toMatchObject({ ok: true, value: 30_000 });
    expect(await settingsService.get()).toMatchObject({ ok: true, value: { businessSaving: 30_000 } });
    expect(await capitalService.calculate()).toMatchObject({ ok: true, value: { currentCapital: 150_000, availableCapital: 120_000, totalSavings: 30_000, totalProfit: 100_000 } });
  });

  it('calcula el capital final por cuenta incluyendo ahorros y transferencias de la jornada', async () => {
    const accounts = await financialAccounts.list('business');
    expect(accounts.ok).toBe(true);
    if (!accounts.ok) return;
    const cash = accounts.value.find((account) => account.name === 'Efectivo')!;
    const nequi = accounts.value.find((account) => account.name === 'Nequi')!;
    await settingsService.update({ businessInitialCapital: 1_000 });
    const started = await journeyService.start();
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    await businessService.create({ type: 'income', amount: 45_000, description: 'Cobro efectivo', paymentMethod: 'Efectivo', date: now.toISOString() });
    await businessService.create({ type: 'income', amount: 80_000, description: 'Cobro Nequi', paymentMethod: 'Nequi', date: now.toISOString() });
    await businessService.create({ type: 'expense', amount: 10_000, description: 'Gasolina', paymentMethod: 'Efectivo', date: now.toISOString() });
    const deposit = await savingService.deposit({ amount: 15_000, description: 'Ahorro previo al cierre', accountId: nequi.id, date: now.toISOString() });
    expect(deposit.ok).toBe(true);
    await transferRepository.create({
      id: uuid(), module: 'business', sourceAccountId: nequi.id, destinationAccountId: cash.id,
      amount: 5_000, description: 'Cambio de cuenta', date: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(), deletedAt: null,
    });

    const closed = await journeyService.close({ savingTransferred: 0 });
    expect(closed).toMatchObject({ ok: true, value: {
      finalCapital: 101_000,
      finalCapitalByAccount: { [cash.id]: 41_000, [nequi.id]: 60_000 },
    } });
  });

  it('incluye movimientos asociados a la jornada aunque su hora registrada quede antes del segundo de inicio', async () => {
    await settingsService.update({ businessInitialCapital: 30_000 });
    const started = await journeyService.start();
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const created = await businessService.create({
      type: 'income', amount: 40_000, description: 'Ingreso al iniciar', paymentMethod: 'Efectivo',
      date: new Date(new Date(started.value.startTime).getTime() - 1_000).toISOString(),
    });
    expect(created.ok).toBe(true);

    const balances = await financialAccounts.balances('business');
    expect(balances).toMatchObject({ ok: true, value: { total: 70_000 } });
    if (balances.ok) expect(balances.value.accounts.find(({ account }) => account.name === 'Efectivo')?.balance).toBe(70_000);
  });

  it('rechaza negocio sin jornada y retiros de ahorro sin fondos', async () => {
    const noJourney = await businessService.create({
      type: 'income', amount: 10_000, description: 'Domicilio', paymentMethod: 'Efectivo', date: now.toISOString(),
    });
    expect(noJourney).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const emptyCapitalStart = await journeyService.start();
    expect(emptyCapitalStart).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    await settingsService.update({ businessInitialCapital: 1_000 });
    const started = await journeyService.start(1_000);
    expect(started.ok).toBe(true);
    const noAccountFunds = await businessService.create({
      type: 'expense', amount: 1_000, description: 'Compra', paymentMethod: 'Nequi', date: now.toISOString(),
    });
    expect(noAccountFunds).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_FUNDS' } });
    const withdrawal = await savingService.withdraw({ amount: 5_000, description: 'Compra de repuesto' });
    expect(withdrawal).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_FUNDS' } });
  });
});
