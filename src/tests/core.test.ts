import { describe, expect, it } from 'vitest';
import { classifyDescription, learnCategory } from '../ai/categoryClassifier';
import { createEmptyData } from '../models/defaults';
import { availableBusinessCapital, buildDashboardSummary, buildFinancialReportAnalytics, buildReport, buildReportExportRows, goalProgress, remainingForGoal, savingsBalance, searchLedger, totalsFor, validateFinancialIntegrity } from '../services/ledger';
import { buildReminders, defaultNotificationPreferences } from '../services/notification.service';
import type { Movement } from '../types';

const entry = (space: Movement['space'], kind: Movement['kind'], amountCOP: number, date = '2026-10-20T10:00:00.000Z', shiftId: string | null = null): Movement => ({
  id: crypto.randomUUID(), space, kind, amountCOP, description: 'Movimiento', occurredAt: date,
  paymentMethod: 'Efectivo', category: '', deliveryCount: kind === 'income' && space === 'deliveries' ? 1 : 0, workdayId: shiftId,
});

describe('cálculos del libro', () => {
  it('construye un resumen del dashboard sin contar registros eliminados', () => {
    const data = createEmptyData();
    data.movements = [
      entry('personal', 'income', 25_000),
      entry('personal', 'expense', 5_000),
      entry('deliveries', 'income', 80_000),
      { ...entry('deliveries', 'income', 90_000), deletedAt: '2026-10-20T11:00:00.000Z' },
      entry('personal', 'expense', 1_000, '2026-09-20T10:00:00.000Z'),
    ];
    data.savings = [
      { id: crypto.randomUUID(), kind: 'deposit', amountCOP: 10_000, occurredAt: '2026-10-20T10:00:00.000Z', note: 'Ahorro' },
      { id: crypto.randomUUID(), kind: 'deposit', amountCOP: 20_000, occurredAt: '2026-10-20T10:00:00.000Z', note: 'Eliminado', deletedAt: '2026-10-20T11:00:00.000Z' },
      { id: crypto.randomUUID(), kind: 'deposit', amountCOP: 5_000, occurredAt: '2026-10-13T10:00:00.000Z', note: 'Ahorro semana previa' },
    ];
    const summary = buildDashboardSummary(data, new Date('2026-10-20T12:00:00.000Z'));
    expect(summary.personalMonth).toMatchObject({ incomeCOP: 25_000, expenseCOP: 5_000, profitCOP: 20_000 });
    expect(summary.businessToday.incomeCOP).toBe(80_000);
    expect(summary.savingsCOP).toBe(15_000);
    expect(summary.businessGoalProgress).toBe(0.8);
    expect(summary.businessGoalRemaining).toBe(20_000);
    expect(summary.recommendations[0]).toContain('80%');
    expect(summary.recommendations).toContain('El ahorro de esta semana aumentó respecto a la semana anterior.');
    expect(summary.recommendations).toContain('Tus gastos personales de este mes superan los del mes anterior.');
  });

  it('prepara series de ingresos, capital, ahorro y cuentas para los gráficos', () => {
    const data = createEmptyData();
    data.settings.startingCapitalCOP = 10_000;
    data.accountBalances = { personal: { total: 0, accounts: [] }, deliveries: { total: 45_000, accounts: [
      { id: crypto.randomUUID(), name: 'Efectivo', balance: 45_000 },
      { id: crypto.randomUUID(), name: 'Nequi', balance: 0 },
    ] } };
    const cashId = data.accountBalances.deliveries.accounts[0].id;
    data.movements = [
      { ...entry('deliveries', 'income', 50_000, '2026-10-20T10:00:00.000Z'), accountId: cashId },
      { ...entry('deliveries', 'expense', 5_000, '2026-10-20T11:00:00.000Z'), accountId: cashId, category: 'Gasolina' },
    ];
    data.savings = [{ id: crypto.randomUUID(), kind: 'deposit', amountCOP: 10_000, occurredAt: '2026-10-20T11:30:00.000Z', note: 'Ahorro', accountId: cashId }];
    const analytics = buildFinancialReportAnalytics(data, 'day', new Date('2026-10-20T12:00:00.000Z'));
    expect(analytics.points.length).toBeGreaterThan(0);
    expect(analytics.points.length).toBeLessThanOrEqual(24);
    expect(analytics.movementCount).toBe(2);
    expect(analytics.expenseCategories).toEqual([{ name: 'Gasolina', value: 5_000 }]);
    expect(analytics.finalCapitalCOP).toBe(45_000);
    expect(analytics.points.find((point) => point.incomeCOP > 0)).toMatchObject({ incomeCOP: 50_000, goalActualCOP: 50_000, goalCOP: 100_000 });
    expect(analytics.points.find((point) => point.expenseCOP > 0)).toMatchObject({ expenseCOP: 5_000, savingsCOP: 10_000, cashCOP: 45_000 });
  });

  it('reconcilia el capital del reporte con la jornada cuando el movimiento cae en el mismo minuto del inicio', () => {
    const data = createEmptyData();
    const cashId = crypto.randomUUID();
    const journeyId = crypto.randomUUID();
    const startedAt = '2026-10-20T08:23:45.000Z';
    data.accountBalances = { personal: { total: 0, accounts: [] }, deliveries: { total: 58_000, accounts: [
      { id: cashId, name: 'Efectivo', balance: 58_000 },
    ] } };
    data.workdays = [{ id: journeyId, startedAt, initialCapitalCOP: 30_000, endedAt: null, savingsTransferredCOP: 0 }];
    data.movements = [
      { ...entry('deliveries', 'income', 40_000, '2026-10-20T08:23:00.000Z', journeyId), accountId: cashId },
      { ...entry('deliveries', 'expense', 12_000, '2026-10-20T08:24:00.000Z', journeyId), accountId: cashId },
    ];

    const analytics = buildFinancialReportAnalytics(data, 'day', new Date('2026-10-20T09:00:00.000Z'));
    expect(analytics.initialCapitalCOP).toBe(30_000);
    expect(analytics.finalCapitalCOP).toBe(58_000);
  });

  it('exporta solo registros activos dentro del rango de fechas elegido', () => {
    const data = createEmptyData();
    data.movements = [
      entry('personal', 'income', 12_000, '2026-10-05T10:00:00.000Z'),
      { ...entry('deliveries', 'expense', 2_000, '2026-10-06T10:00:00.000Z'), deletedAt: '2026-10-06T12:00:00.000Z' },
      entry('deliveries', 'expense', 3_000, '2026-10-10T10:00:00.000Z'),
    ];
    const rows = buildReportExportRows(data, '2026-10-05', '2026-10-07');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ module: 'Finanzas personales', type: 'Ingreso', amountCOP: 12_000 });
  });

  it('busca movimientos, transferencias y reportes por texto, importe y cuenta', () => {
    const data = createEmptyData();
    const cashId = crypto.randomUUID();
    const nequiId = crypto.randomUUID();
    data.accountBalances = { personal: { total: 0, accounts: [
      { id: cashId, name: 'Efectivo', balance: 0 }, { id: nequiId, name: 'Nequi', balance: 0 },
    ] }, deliveries: { total: 0, accounts: [{ id: cashId, name: 'Efectivo', balance: 0 }] } };
    data.movements = [{ ...entry('personal', 'expense', 25_000), description: 'Mercado semanal', accountId: cashId, category: 'Alimentación' }];
    data.transfers = { personal: [{ id: crypto.randomUUID(), module: 'personal', sourceAccountId: nequiId, destinationAccountId: cashId, amount: 5_000, description: 'Cambio para efectivo', date: '2026-10-20T10:00:00.000Z' }], deliveries: [] };
    data.savings = [{ id: crypto.randomUUID(), kind: 'deposit', amountCOP: 3_000, occurredAt: '2026-10-20T10:00:00.000Z', note: 'Reserva', accountId: cashId }];
    expect(searchLedger(data, 'mercado 25000')[0]).toMatchObject({ type: 'movement', title: 'Mercado semanal', amountCOP: 25_000 });
    expect(searchLedger(data, 'nequi efectivo')[0]).toMatchObject({ type: 'transfer', title: 'Cambio para efectivo' });
    expect(searchLedger(data, 'reserva efectivo')[0]).toMatchObject({ type: 'saving' });
    expect(searchLedger(data, 'anual')).toMatchObject([{ type: 'report', title: 'Reporte Anual' }]);
  });

  it('detecta automáticamente descuadres de capital y movimientos de negocio huérfanos', () => {
    const data = createEmptyData();
    const accountId = crypto.randomUUID();
    data.accountBalances = { personal: { total: 0, accounts: [] }, deliveries: { total: 10, accounts: [{ id: accountId, name: 'Efectivo', balance: 9 }] } };
    data.movements = [{ ...entry('deliveries', 'income', 10), accountId, workdayId: 'missing' }];
    data.businessProfitCOP = 12;
    expect(validateFinancialIntegrity(data)).toEqual(expect.arrayContaining([
      expect.stringContaining('no coincide'), expect.stringContaining('jornada válida'), expect.stringContaining('utilidad'),
    ]));
  });

  it('genera recordatorios opcionales con información existente y omite los desactivados', () => {
    const data = createEmptyData();
    const enabled = { ...defaultNotificationPreferences, enabled: true };
    expect(buildReminders(data, defaultNotificationPreferences, new Date('2026-10-23T14:00:00.000Z'))).toEqual([]);
    expect(buildReminders(data, enabled, new Date('2026-10-23T14:00:00.000Z')).map((item) => item.key)).toContain('startWorkday');
    expect(buildReminders(data, enabled, new Date('2026-10-23T21:00:00.000Z')).map((item) => item.key)).toContain('weeklyReport');
  });

  it('mantiene independientes finanzas y domicilios', () => {
    const movements = [entry('personal', 'income', 80_000), entry('deliveries', 'income', 50_000), entry('deliveries', 'expense', 12_000)];
    expect(totalsFor(movements, 'personal').profitCOP).toBe(80_000);
    expect(totalsFor(movements, 'deliveries').profitCOP).toBe(38_000);
  });

  it('descuenta una transferencia al calcular el capital del negocio', () => {
    const workday = { id: 'turno-1', startedAt: '2026-10-20T08:00:00.000Z', initialCapitalCOP: 20_000, endedAt: null, savingsTransferredCOP: 15_000 };
    const movements = [entry('deliveries', 'income', 70_000, undefined, workday.id), entry('deliveries', 'expense', 18_000, undefined, workday.id)];
    expect(availableBusinessCapital(workday, movements)).toBe(57_000);
  });

  it('limita el avance de meta y el valor faltante', () => {
    expect(goalProgress(63_000, 100_000)).toBe(0.63);
    expect(goalProgress(120_000, 100_000)).toBe(1);
    expect(goalProgress(20, 0)).toBe(0);
    expect(remainingForGoal(120_000, 100_000)).toBe(0);
  });

  it('calcula ahorro y retiros con signo correcto', () => {
    expect(savingsBalance([{ kind: 'deposit', amountCOP: 35_000 }, { kind: 'withdrawal', amountCOP: 10_000 }])).toBe(25_000);
  });

  it('genera resumen diario con mejor día y metas', () => {
    const movements = [
      entry('deliveries', 'income', 120_000, '2026-10-20T10:00:00.000Z'),
      entry('deliveries', 'expense', 20_000, '2026-10-20T11:00:00.000Z'),
    ];
    const result = buildReport(movements, [], 'day', 100_000, new Date('2026-10-20T12:00:00.000Z'));
    expect(result.profitCOP).toBe(100_000);
    expect(result.goalReachedDays).toBe(1);
    expect(result.bestDay?.profitCOP).toBe(100_000);
  });
});

describe('clasificación local', () => {
  it('clasifica descripciones y aprende dentro del módulo', () => {
    const data = createEmptyData();
    expect(classifyDescription('Compra del mercado', 'personal', data.settings)).toBe('Alimentación');
    expect(classifyDescription('Tanqueo de gasolina', 'deliveries', data.settings)).toBe('Gasolina');
    expect(classifyDescription('Una categoría rara', 'personal', data.settings)).toBeNull();
    const learned = learnCategory(data.settings, 'personal', 'consulta odontológica', 'Salud');
    expect(classifyDescription('Nueva consulta odontológica', 'personal', learned)).toBe('Salud');
    expect(classifyDescription('Nueva consulta odontológica', 'deliveries', learned)).toBeNull();
  });
});

