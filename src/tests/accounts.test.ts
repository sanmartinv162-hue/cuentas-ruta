import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { FinanceAssistantDatabase } from '../database/db';
import { FinancialAccountRepository } from '../repositories/account.repository';
import { AccountTransferRepository } from '../repositories/account-transfer.repository';
import { BusinessMovementRepository } from '../repositories/business.repository';
import { FinanceUnitOfWorkRepository } from '../repositories/finance-unit-of-work.repository';
import { JourneyRepository } from '../repositories/journey.repository';
import { PersonalMovementRepository } from '../repositories/personal.repository';
import { SavingRepository } from '../repositories/saving.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { AccountTransferService } from '../services/accountTransfer.service';
import { ClassificationService } from '../services/classification.service';
import { FinancialAccountService } from '../services/financialAccount.service';
import { PersonalService } from '../services/personal.service';
import type { IdentityProvider } from '../utils/identity';

let database: FinanceAssistantDatabase;
let accounts: FinancialAccountService;
let personal: PersonalService;
let transfers: AccountTransferService;
const timestamp = '2026-10-20T18:00:00.000Z';

beforeEach(async () => {
  database = new FinanceAssistantDatabase(`AccountTests-${uuid()}`);
  await database.open();
  const identity: IdentityProvider = { createId: uuid, getDeviceId: async () => 'account-test-device' };
  const personalRepository = new PersonalMovementRepository(database);
  const businessRepository = new BusinessMovementRepository(database);
  const transferRepository = new AccountTransferRepository(database);
  const settingsRepository = new SettingsRepository(database);
  accounts = new FinancialAccountService(
    new FinancialAccountRepository(database), personalRepository, businessRepository, transferRepository,
    new SavingRepository(database), settingsRepository, identity, () => new Date(timestamp), new JourneyRepository(database),
  );
  personal = new PersonalService(
    personalRepository, new ClassificationService(undefined, identity, () => new Date(timestamp)), identity,
    () => new Date(timestamp), accounts,
  );
  transfers = new AccountTransferService(transferRepository, new FinanceUnitOfWorkRepository(database), accounts, identity, () => new Date(timestamp));
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe('cuentas y transferencias', () => {
  const expectFourUniqueDefaults = async () => {
    const rows = await database.accounts.toArray();
    expect(rows).toHaveLength(4);
    expect(rows.map(({ module, name }) => `${module}:${name}`).sort()).toEqual([
      'business:Efectivo', 'business:Nequi', 'personal:Efectivo', 'personal:Nequi',
    ]);
    expect(new Set(rows.map(({ module, normalizedName }) => `${module}:${normalizedName}`)).size).toBe(4);
  };

  it.each([1, 2, 5])('deja exactamente cuatro cuentas tras %i inicializaciones consecutivas', async (count) => {
    for (let index = 0; index < count; index += 1) {
      const module = index % 2 === 0 ? 'personal' : 'business';
      const initialized = await accounts.initialize(module);
      expect(initialized.ok).toBe(true);
    }
    await accounts.initialize('personal');
    await accounts.initialize('business');
    await expectFourUniqueDefaults();
  });

  it('serializa inicializaciones simultáneas incluso desde servicios distintos', async () => {
    const identity: IdentityProvider = { createId: uuid, getDeviceId: async () => 'concurrent-account-test' };
    const secondService = new FinancialAccountService(
      new FinancialAccountRepository(database), new PersonalMovementRepository(database),
      new BusinessMovementRepository(database), new AccountTransferRepository(database),
      new SavingRepository(database), new SettingsRepository(database), identity,
      () => new Date(timestamp), new JourneyRepository(database),
    );
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      (index % 2 ? accounts : secondService).initialize(index % 3 ? 'personal' : 'business')));
    expect(results.every((result) => result.ok)).toBe(true);
    await expectFourUniqueDefaults();
  });

  it('no permite duplicar una cuenta aunque se intente insertar directamente en persistencia', async () => {
    const initialized = await accounts.initialize('personal');
    expect(initialized.ok).toBe(true);
    await accounts.initialize('business');
    const existing = await database.accounts.where('[module+normalizedName]').equals(['personal', 'efectivo']).first();
    expect(existing).toBeDefined();
    if (!existing) return;
    await expect(database.accounts.add({ ...existing, id: uuid(), normalizedName: 'forged-other-key' })).rejects.toMatchObject({ name: 'ConstraintError' });
    await expectFourUniqueDefaults();
  });

  it('mantiene cuentas aisladas por módulo y conserva el capital total al transferir', async () => {
    const personalAccounts = await accounts.list('personal');
    const businessAccounts = await accounts.list('business');
    expect(personalAccounts.ok && personalAccounts.value.map((item) => item.name).sort()).toEqual(['Efectivo', 'Nequi']);
    expect(businessAccounts.ok && businessAccounts.value.map((item) => item.name).sort()).toEqual(['Efectivo', 'Nequi']);
    if (!personalAccounts.ok || !businessAccounts.ok) return;
    expect(personalAccounts.value[0].id).not.toBe(businessAccounts.value[0].id);

    const income = await personal.create({ type: 'income', amount: 10_000, description: 'Venta', paymentMethod: 'Efectivo', date: timestamp });
    expect(income.ok).toBe(true);
    const before = await accounts.balances('personal');
    const business = await accounts.balances('business');
    expect(before.ok && before.value.total).toBe(10_000);
    expect(business.ok && business.value.total).toBe(0);

    const cash = personalAccounts.value.find((account) => account.name === 'Efectivo')!;
    const nequi = personalAccounts.value.find((account) => account.name === 'Nequi')!;
    const transfer = await transfers.create({
      module: 'personal', sourceAccountId: cash.id,
      destinationAccountId: nequi.id, amount: 3_000,
      description: 'Mover efectivo a Nequi', date: timestamp,
    });
    expect(transfer.ok).toBe(true);
    const after = await accounts.balances('personal');
    expect(after.ok && after.value.total).toBe(10_000);
    expect(after.ok && Object.fromEntries(after.value.accounts.map((account) => [account.account.name, account.balance]))).toEqual({ Efectivo: 7_000, Nequi: 3_000 });
  });

  it('descuenta y acredita correctamente una transferencia entre personal y negocio', async () => {
    const personalAccounts = await accounts.list('personal');
    const businessAccounts = await accounts.list('business');
    if (!personalAccounts.ok || !businessAccounts.ok) return;

    const personalNequi = personalAccounts.value.find((account) => account.name === 'Nequi')!;
    const businessNequi = businessAccounts.value.find((account) => account.name === 'Nequi')!;
    const income = await personal.create({ type: 'income', amount: 10_000, description: 'Saldo personal', paymentMethod: 'Nequi', date: timestamp });
    expect(income.ok).toBe(true);

    const transfer = await transfers.create({
      module: 'personal', sourceModule: 'personal', destinationModule: 'business',
      sourceAccountId: personalNequi.id, destinationAccountId: businessNequi.id,
      amount: 3_000, description: 'Aporte al negocio', date: timestamp,
    });
    expect(transfer.ok).toBe(true);

    const personalBalances = await accounts.balances('personal');
    const businessBalances = await accounts.balances('business');
    expect(personalBalances.ok && Object.fromEntries(personalBalances.value.accounts.map(({ account, balance }) => [account.name, balance]))).toEqual({ Efectivo: 0, Nequi: 7_000 });
    expect(businessBalances.ok && Object.fromEntries(businessBalances.value.accounts.map(({ account, balance }) => [account.name, balance]))).toEqual({ Efectivo: 0, Nequi: 3_000 });
  });

  it('aplica una transferencia negocio a personal usando el Nequi correcto en ambos módulos', async () => {
    const personalAccounts = await accounts.list('personal');
    const businessAccounts = await accounts.list('business');
    if (!personalAccounts.ok || !businessAccounts.ok) return;
    const personalNequi = personalAccounts.value.find((account) => account.name === 'Nequi')!;
    const businessNequi = businessAccounts.value.find((account) => account.name === 'Nequi')!;
    await database.settings.add({
      id: 'global', dailyGoal: 100_000, currency: 'COP', theme: 'system',
      businessInitialCapital: 10_000, businessInitialCapitalByAccount: { [businessNequi.id]: 10_000 },
      personalInitialCapitalByAccount: {}, businessSaving: 0,
      createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
    });

    const transfer = await transfers.create({
      module: 'business', sourceModule: 'business', destinationModule: 'personal',
      sourceAccountId: businessNequi.id, destinationAccountId: personalNequi.id,
      amount: 4_000, description: 'Retiro del negocio', date: timestamp,
    });
    expect(transfer.ok).toBe(true);
    const personalBalances = await accounts.balances('personal');
    const businessBalances = await accounts.balances('business');
    expect(personalBalances.ok && Object.fromEntries(personalBalances.value.accounts.map(({ account, balance }) => [account.name, balance]))).toEqual({ Efectivo: 0, Nequi: 4_000 });
    expect(businessBalances.ok && Object.fromEntries(businessBalances.value.accounts.map(({ account, balance }) => [account.name, balance]))).toEqual({ Efectivo: 0, Nequi: 6_000 });
  });

  it('suma y resta movimientos de Nequi sobre la misma cuenta', async () => {
    const income = await personal.create({ type: 'income', amount: 7_000, description: 'Ingreso Nequi', paymentMethod: 'Nequi', date: timestamp });
    expect(income.ok).toBe(true);
    const expense = await personal.create({ type: 'expense', amount: 2_000, description: 'Compra Nequi', paymentMethod: 'Nequi', date: timestamp });
    expect(expense.ok).toBe(true);
    const balances = await accounts.balances('personal');
    expect(balances.ok && balances.value.accounts.find(({ account }) => account.name === 'Nequi')?.balance).toBe(5_000);
  });

  it('mantiene el capital inicial personal separado del capital del negocio', async () => {
    const personalAccounts = await accounts.list('personal');
    const businessAccounts = await accounts.list('business');
    if (!personalAccounts.ok || !businessAccounts.ok) throw new Error('No se inicializaron las cuentas.');
    const personalCash = personalAccounts.value.find((account) => account.name === 'Efectivo')!;
    const personalNequi = personalAccounts.value.find((account) => account.name === 'Nequi')!;
    const businessCash = businessAccounts.value.find((account) => account.name === 'Efectivo')!;
    await database.settings.add({
      id: 'global', dailyGoal: 100_000, currency: 'COP', theme: 'system',
      businessInitialCapital: 5_000, businessInitialCapitalByAccount: { [businessCash.id]: 5_000 },
      personalInitialCapitalByAccount: { [personalCash.id]: 12_000, [personalNequi.id]: 8_000 },
      businessSaving: 0, createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
    });

    const personalBalances = await accounts.balances('personal');
    const businessBalances = await accounts.balances('business');
    expect(personalBalances.ok && personalBalances.value.total).toBe(20_000);
    expect(personalBalances.ok && Object.fromEntries(personalBalances.value.accounts.map(({ account, balance }) => [account.name, balance]))).toEqual({ Efectivo: 12_000, Nequi: 8_000 });
    expect(businessBalances.ok && businessBalances.value.total).toBe(5_000);
    expect(businessBalances.ok && businessBalances.value.accounts.every(({ account, balance }) => account.id === businessCash.id ? balance === 5_000 : balance === 0)).toBe(true);
  });

  it('protege saldo insuficiente y permite eliminar/restaurar una transferencia sin pérdida', async () => {
    const initialized = await accounts.initialize('personal');
    if (!initialized.ok) return;
    const [cash, nequi] = initialized.value;
    const insufficient = await transfers.create({ module: 'personal', sourceAccountId: cash.id, destinationAccountId: nequi.id, amount: 1, description: 'Sin fondos' });
    expect(insufficient).toMatchObject({ ok: false, error: { code: 'INSUFFICIENT_FUNDS' } });

    await personal.create({ type: 'income', amount: 5_000, description: 'Pago', paymentMethod: cash.name, date: timestamp });
    const created = await transfers.create({ module: 'personal', sourceAccountId: cash.id, destinationAccountId: nequi.id, amount: 2_000, description: 'Transferencia' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await transfers.delete(created.value.id)).toMatchObject({ ok: true, value: { deletedAt: timestamp } });
    let balance = await accounts.balances('personal');
    expect(balance).toMatchObject({ ok: true, value: { total: 5_000, accounts: [{ balance: 5_000 }, { balance: 0 }] } });
    expect(await transfers.restore(created.value.id)).toMatchObject({ ok: true, value: { deletedAt: null } });
    balance = await accounts.balances('personal');
    expect(balance).toMatchObject({ ok: true, value: { total: 5_000, accounts: [{ balance: 3_000 }, { balance: 2_000 }] } });
  });
});
