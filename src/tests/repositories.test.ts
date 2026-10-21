import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { FinanceAssistantDatabase } from '../database/db';
import { BusinessMovementRepository } from '../repositories/business.repository';
import { CapitalRepository } from '../repositories/capital.repository';
import { JourneyRepository } from '../repositories/journey.repository';
import { PersonalMovementRepository } from '../repositories/personal.repository';
import { SavingRepository } from '../repositories/saving.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import type { BusinessMovementRecord, JourneyRecord, PersonalMovementRecord, SavingRecord, SettingsRecord } from '../types/database';

let database: FinanceAssistantDatabase;
let personal: PersonalMovementRepository;
let business: BusinessMovementRepository;
let journeys: JourneyRepository;
let savings: SavingRepository;
let settings: SettingsRepository;
let capital: CapitalRepository;
const timestamp = '2026-10-20T12:00:00.000Z';

beforeEach(async () => {
  database = new FinanceAssistantDatabase(`RepositoryTests-${uuid()}`);
  await database.open();
  personal = new PersonalMovementRepository(database);
  business = new BusinessMovementRepository(database);
  journeys = new JourneyRepository(database);
  savings = new SavingRepository(database);
  settings = new SettingsRepository(database);
  capital = new CapitalRepository(database);
});

afterEach(async () => {
  database.close();
  await database.delete();
});

function personalRecord(overrides: Partial<PersonalMovementRecord> = {}): PersonalMovementRecord {
  return {
    id: uuid(), type: 'expense', amount: 12_000, description: 'Mercado del barrio', paymentMethod: 'Nequi',
    detectedCategory: 'Alimentación', date: timestamp, createdAt: timestamp, updatedAt: timestamp,
    deletedAt: null, version: 1, synced: false, syncVersion: 0, deviceId: uuid(), ...overrides,
  };
}

function businessRecord(journeyId: string, overrides: Partial<BusinessMovementRecord> = {}): BusinessMovementRecord {
  return {
    ...personalRecord(), id: uuid(), journeyId, type: 'income', amount: 40_000,
    description: 'Domicilio', detectedCategory: '', ...overrides,
  };
}

function journeyRecord(overrides: Partial<JourneyRecord> = {}): JourneyRecord {
  return {
    id: uuid(), startTime: timestamp, endTime: null, initialCapital: 100_000, finalCapital: 100_000,
    income: 0, expenses: 0, profit: 0, savingTransferred: 0, goalAmount: 100_000,
    goalProgress: 0, goalReached: false, status: 'active', createdAt: timestamp, updatedAt: timestamp,
    deletedAt: null, ...overrides,
  };
}

function settingsRecord(): SettingsRecord {
  return { id: 'global', dailyGoal: 100_000, currency: 'COP', theme: 'system', businessInitialCapital: 50_000, businessSaving: 0, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
}

describe('repositories financieros', () => {
  it('crea, consulta por fecha/descripción, busca, cuenta y restaura movimientos personales', async () => {
    const record = personalRecord();
    await personal.create(record);
    expect(await personal.findById(record.id)).toMatchObject({ id: record.id });
    expect((await personal.findByDate('2026-10-20')).map((item) => item.id)).toContain(record.id);
    expect((await personal.findBetweenDates(timestamp, timestamp)).map((item) => item.id)).toContain(record.id);
    expect((await personal.findByDescription('mercado')).map((item) => item.id)).toContain(record.id);
    expect((await personal.search({ query: 'barrio', category: 'Alimentación', paymentMethod: 'Nequi' })).map((item) => item.id)).toContain(record.id);
    expect(await personal.count()).toBe(1);

    const updated = await personal.update(record.id, { amount: 15_000 });
    expect(updated).toMatchObject({ amount: 15_000, version: 2, synced: false, syncVersion: 1 });
    await personal.delete(record.id);
    expect(await personal.findById(record.id)).toBeNull();
    expect(await personal.count()).toBe(0);
    expect(await personal.count({ includeDeleted: true })).toBe(1);
    await personal.restore(record.id);
    expect((await personal.findById(record.id))?.deletedAt).toBeNull();
  });

  it('busca y filtra movimientos de negocio por jornada', async () => {
    const journeyId = uuid();
    const record = businessRecord(journeyId);
    await business.create(record);
    expect((await business.search({ journeyId, type: 'income' })).map((item) => item.id)).toContain(record.id);
    expect((await business.findBetweenDates(timestamp, timestamp)).map((item) => item.id)).toContain(record.id);
    expect(await business.count()).toBe(1);
  });

  it('ofrece CRUD lógico de jornadas y ahorro', async () => {
    const journey = journeyRecord();
    await journeys.create(journey);
    expect((await journeys.findByDate('2026-10-20')).map((item) => item.id)).toContain(journey.id);
    expect((await journeys.findByDescription('active')).map((item) => item.id)).toContain(journey.id);

    const saving: SavingRecord = { id: uuid(), type: 'deposit', amount: 10_000, description: 'Cierre de jornada', balanceAfter: 10_000, date: timestamp, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
    await savings.create(saving);
    expect((await savings.findByDescription('cierre')).map((item) => item.id)).toContain(saving.id);
    await savings.delete(saving.id);
    expect(await savings.findById(saving.id)).toBeNull();
    await savings.restore(saving.id);
    expect(await savings.count()).toBe(1);
  });

  it('limita Settings a un registro y solo persiste capital calculado', async () => {
    await settings.create(settingsRecord());
    await expect(settings.create(settingsRecord())).rejects.toMatchObject({ code: 'CONFLICT' });
    const calculated = { id: 'current' as const, currentCapital: 110_000, availableCapital: 100_000, totalSavings: 10_000, totalProfit: 60_000, updatedAt: timestamp };
    await capital.saveCalculated(calculated);
    expect(await capital.findById('current')).toMatchObject(calculated);
    await expect(capital.update('current', { availableCapital: 1 })).rejects.toMatchObject({ code: 'READ_ONLY' });
  });

  it('convierte IDs duplicados en un conflicto de repositorio', async () => {
    const record = personalRecord();
    await personal.create(record);
    await expect(personal.create(record)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
