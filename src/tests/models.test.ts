import { describe, expect, it } from 'vitest';
import { businessMovementSchema } from '../models/businessMovement';
import { capitalSchema } from '../models/capital';
import { classificationRuleSchema } from '../models/classificationRule';
import { dailyGoalSchema } from '../models/dailyGoal';
import { journeySchema } from '../models/journey';
import { personalMovementSchema } from '../models/personalMovement';
import { savingSchema } from '../models/saving';
import { settingsSchema } from '../models/settings';

const id = '00000000-0000-4000-8000-000000000001';
const journeyId = '00000000-0000-4000-8000-000000000002';
const timestamp = '2026-10-20T12:00:00.000Z';
const sync = { version: 1, synced: false, syncVersion: 0, deviceId: id };

const personalMovement = {
  id, type: 'income', amount: 20_000, description: 'Pago', paymentMethod: 'Nequi', detectedCategory: '',
  date: timestamp, createdAt: timestamp, updatedAt: timestamp, deletedAt: null, ...sync,
};

const businessMovement = { ...personalMovement, journeyId };

const journey = {
  id: journeyId, startTime: timestamp, endTime: timestamp, initialCapital: 100_000, finalCapital: 220_000,
  income: 200_000, expenses: 50_000, profit: 150_000, savingTransferred: 30_000, goalAmount: 100_000,
  goalProgress: 100, goalReached: true, status: 'closed', createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
};

describe('modelos y contratos Zod', () => {
  it('valida movimientos personales y rechaza importes inválidos', () => {
    expect(personalMovementSchema.safeParse(personalMovement).success).toBe(true);
    expect(personalMovementSchema.safeParse({ ...personalMovement, amount: -1 }).success).toBe(false);
    expect(personalMovementSchema.safeParse({ ...personalMovement, description: '   ' }).success).toBe(false);
    expect(personalMovementSchema.safeParse({ ...personalMovement, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('exige jornada válida para movimientos del negocio', () => {
    expect(businessMovementSchema.safeParse(businessMovement).success).toBe(true);
    expect(businessMovementSchema.safeParse({ ...businessMovement, journeyId: '' }).success).toBe(false);
  });

  it('comprueba consistencia financiera de jornadas', () => {
    expect(journeySchema.safeParse(journey).success).toBe(true);
    expect(journeySchema.safeParse({ ...journey, profit: 149_999 }).success).toBe(false);
    expect(journeySchema.safeParse({ ...journey, finalCapital: 999 }).success).toBe(false);
    expect(journeySchema.safeParse({ ...journey, endTime: null }).success).toBe(false);
  });

  it('valida configuración singleton, moneda y tema', () => {
    const settings = {
      id: 'global', dailyGoal: 100_000, currency: 'COP', theme: 'system',
      businessInitialCapital: 50_000, businessSaving: 25_000, createdAt: timestamp, updatedAt: timestamp,
    };
    expect(settingsSchema.safeParse(settings).success).toBe(true);
    expect(settingsSchema.safeParse({ ...settings, id: 'another' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...settings, currency: 'col' }).success).toBe(false);
  });

  it('valida depósitos/retiros y saldo posterior no negativo', () => {
    const saving = { id, type: 'withdraw', amount: 1_000, description: 'Repuesto', balanceAfter: 4_000, date: timestamp, createdAt: timestamp, updatedAt: timestamp };
    expect(savingSchema.safeParse(saving).success).toBe(true);
    expect(savingSchema.safeParse({ ...saving, balanceAfter: -1 }).success).toBe(false);
  });

  it('verifica capital y meta calculados', () => {
    const capital = { id: 'current', currentCapital: 220_000, availableCapital: 190_000, totalSavings: 30_000, totalProfit: 150_000, updatedAt: timestamp };
    const goal = { id, goal: 100_000, current: 120_000, remaining: 0, percentage: 100, completed: true, date: '2026-10-20' };
    expect(capitalSchema.safeParse(capital).success).toBe(true);
    expect(capitalSchema.safeParse({ ...capital, currentCapital: 219_000 }).success).toBe(false);
    expect(dailyGoalSchema.safeParse(goal).success).toBe(true);
    expect(dailyGoalSchema.safeParse({ ...goal, percentage: 75 }).success).toBe(false);
  });

  it('valida reglas de clasificación y confianza', () => {
    const rule = { id, keyword: 'Texaco', category: 'Gasolina', timesUsed: 4, confidence: 0.9, createdAt: timestamp };
    expect(classificationRuleSchema.safeParse(rule).success).toBe(true);
    expect(classificationRuleSchema.safeParse({ ...rule, confidence: 1.1 }).success).toBe(false);
  });
});
