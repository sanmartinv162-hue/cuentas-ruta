import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { FinanceAssistantDatabase } from '../database/db';
import { PersonalMovementRepository } from '../repositories/personal.repository';
import type { PersonalMovementRecord } from '../types/database';

let database: FinanceAssistantDatabase;
let repository: PersonalMovementRepository;

beforeEach(async () => {
  database = new FinanceAssistantDatabase(`Performance-${uuid()}`);
  await database.open();
  repository = new PersonalMovementRepository(database);
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe('rendimiento con 10.000 movimientos', () => {
  it('indexa y consulta fechas, descripciones y conteos en tiempo acotado', async () => {
    const createdAt = '2026-10-20T08:00:00.000Z';
    const records: PersonalMovementRecord[] = Array.from({ length: 10_000 }, (_, index) => {
      const day = String((index % 28) + 1).padStart(2, '0');
      return {
        id: uuid(),
        type: index % 3 === 0 ? 'income' : 'expense',
        amount: 10_000 + index,
        description: index % 2 === 0 ? `Compra del mercado #${index}` : `Pago recibido #${index}`,
        paymentMethod: index % 2 === 0 ? 'Nequi' : 'Efectivo',
        detectedCategory: index % 2 === 0 ? 'Alimentación' : 'Ingreso',
        date: `2026-10-${day}T08:00:00.000Z`,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
        version: 1,
        synced: false,
        syncVersion: 0,
        deviceId: 'performance-device',
      };
    });
    await database.personalMovements.bulkAdd(records);

    const start = performance.now();
    const sameDay = await repository.findByDate('2026-10-20');
    const dateRange = await repository.findBetweenDates('2026-10-10T00:00:00.000Z', '2026-10-12T23:59:59.999Z');
    const descriptionMatches = await repository.findByDescription('Compra del mercado #99');
    const count = await repository.count();
    const elapsed = performance.now() - start;

    expect(sameDay).toHaveLength(357);
    expect(dateRange.length).toBeGreaterThan(0);
    expect(descriptionMatches.length).toBeGreaterThan(0);
    expect(count).toBe(10_000);
    expect(elapsed).toBeLessThan(15_000);
  }, 30_000);
});
