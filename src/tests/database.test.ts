import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { DATABASE_NAME, schemaV1, schemaV2, schemaV3 } from '../database/schema';
import type { SettingsRecord } from '../types/database';

beforeEach(async () => {
  db.close();
  await db.delete();
});

afterEach(() => {
  db.close();
});

describe('FinanceAssistantDB', () => {
  it('crea todas las tablas e índices de consulta', async () => {
    await db.open();
    expect(db.name).toBe('FinanceAssistantDB');
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'accounts', 'businessMovements', 'capital', 'classificationRules', 'dailyGoals',
      'journeys', 'metadata', 'personalMovements', 'savings', 'settings', 'transfers',
    ]);

    const personalIndexes = db.personalMovements.schema.indexes.map((index) => index.name);
    const businessIndexes = db.businessMovements.schema.indexes.map((index) => index.name);
    expect(personalIndexes).toEqual(expect.arrayContaining(['date', 'description', 'detectedCategory', 'type', 'createdAt', 'paymentMethod']));
    expect(businessIndexes).toEqual(expect.arrayContaining(['journeyId', 'date', 'description', 'detectedCategory', 'type', 'createdAt', 'paymentMethod']));
  });

  it('rechaza ids duplicados mediante la clave primaria única', async () => {
    await db.open();
    const now = new Date().toISOString();
    const settings: SettingsRecord = {
      id: 'global', dailyGoal: 100_000, currency: 'COP', theme: 'system',
      businessInitialCapital: 0, businessSaving: 0, createdAt: now, updatedAt: now,
    };
    await db.settings.add(settings);
    await expect(db.settings.add(settings)).rejects.toMatchObject({ name: 'ConstraintError' });
  });

  it('migra registros v1 y agrega valores de sincronización', async () => {
    const legacy = new Dexie(DATABASE_NAME);
    legacy.version(1).stores(schemaV1);
    await legacy.open();
    await legacy.table('personalMovements').add({
      id: 'movement-v1', type: 'income', amount: 20_000, description: 'Pago',
      paymentMethod: 'Efectivo', detectedCategory: '', date: '2026-10-20T10:00:00.000Z',
      createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z',
    });
    legacy.close();

    await db.open();
    const migrated = await db.personalMovements.get('movement-v1');
    expect(migrated).toMatchObject({ version: 1, synced: false, syncVersion: 1, deviceId: 'migration-v1', deletedAt: null });
  });

  it('consolida duplicados v3 y reasigna referencias y saldos antes de imponer unicidad', async () => {
    const legacy = new Dexie(DATABASE_NAME);
    legacy.version(1).stores(schemaV1);
    legacy.version(2).stores(schemaV2);
    legacy.version(3).stores(schemaV3);
    await legacy.open();
    const accountRows = [
      ['p-cash', 'personal', 'Efectivo', '2026-01-01T00:00:00.000Z'],
      ['p-cash-duplicate', 'personal', ' efectivo ', '2026-01-02T00:00:00.000Z'],
      ['p-nequi', 'personal', 'Nequi', '2026-01-01T00:00:00.000Z'],
      ['p-nequi-duplicate', 'personal', 'NEQUI', '2026-01-02T00:00:00.000Z'],
      ['b-cash', 'business', 'Efectivo', '2026-01-01T00:00:00.000Z'],
      ['b-cash-duplicate', 'business', 'efectivo', '2026-01-02T00:00:00.000Z'],
      ['b-nequi', 'business', 'Nequi', '2026-01-01T00:00:00.000Z'],
      ['b-nequi-duplicate', 'business', 'nequi', '2026-01-02T00:00:00.000Z'],
    ].map(([id, module, name, createdAt]) => ({ id, module, name, createdAt, updatedAt: createdAt, deletedAt: null }));
    await legacy.table('accounts').bulkAdd(accountRows);
    await legacy.table('personalMovements').add({ id: 'p-movement', accountId: 'p-cash-duplicate' });
    await legacy.table('businessMovements').add({ id: 'b-movement', accountId: 'b-nequi-duplicate' });
    await legacy.table('savings').add({ id: 'saving', accountId: 'b-cash-duplicate' });
    await legacy.table('transfers').add({ id: 'transfer', sourceAccountId: 'b-cash-duplicate', destinationAccountId: 'b-nequi-duplicate' });
    await legacy.table('journeys').add({
      id: 'journey', initialCapitalByAccount: { 'b-cash': 100, 'b-cash-duplicate': 200 },
      finalCapitalByAccount: { 'b-nequi-duplicate': 450 }, incomeByAccount: { 'b-nequi-duplicate': 30 },
      expensesByAccount: { 'b-cash-duplicate': 20 },
    });
    await legacy.table('settings').add({ id: 'global', businessInitialCapitalByAccount: { 'b-cash': 100, 'b-cash-duplicate': 200 } });
    legacy.close();

    await db.open();
    expect(await db.accounts.count()).toBe(4);
    expect((await db.personalMovements.get('p-movement'))?.accountId).toBe('p-cash');
    expect((await db.businessMovements.get('b-movement'))?.accountId).toBe('b-nequi');
    expect((await db.savings.get('saving'))?.accountId).toBe('b-cash');
    expect(await db.transfers.get('transfer')).toMatchObject({ sourceAccountId: 'b-cash', destinationAccountId: 'b-nequi' });
    expect(await db.journeys.get('journey')).toMatchObject({
      initialCapitalByAccount: { 'b-cash': 300 }, finalCapitalByAccount: { 'b-nequi': 450 },
      incomeByAccount: { 'b-nequi': 30 }, expensesByAccount: { 'b-cash': 20 },
    });
    expect(await db.settings.get('global')).toMatchObject({ businessInitialCapitalByAccount: { 'b-cash': 300 } });
    await expect(db.accounts.add({
      id: 'new-duplicate', module: 'business', name: 'Efectivo', normalizedName: 'forged-other-key',
      createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z', deletedAt: null,
    })).rejects.toMatchObject({ name: 'ConstraintError' });
    await expect(db.accounts.add({
      id: 'new-normalized-duplicate', module: 'business', name: 'efectivo', normalizedName: 'efectivo',
      createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z', deletedAt: null,
    })).rejects.toMatchObject({ name: 'ConstraintError' });
  });
});
