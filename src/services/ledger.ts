import type { AppData, LedgerSpace, Movement, ReportRange, Totals, Workday } from '../types';
import { formatCOP } from '../utils/format';

export function totalsFor(movements: Movement[], space?: LedgerSpace): Totals {
  const scoped = movements.filter((movement) => !movement.deletedAt && !movement.internalTransfer && (!space || movement.space === space));
  const incomeCOP = scoped.filter((movement) => movement.kind === 'income').reduce((sum, item) => sum + item.amountCOP, 0);
  const expenseCOP = scoped.filter((movement) => movement.kind === 'expense').reduce((sum, item) => sum + item.amountCOP, 0);
  return { incomeCOP, expenseCOP, profitCOP: incomeCOP - expenseCOP };
}

export function savingsBalance(movements: { kind: 'deposit' | 'withdrawal'; amountCOP: number; deletedAt?: string | null }[]): number {
  return movements.filter((movement) => !movement.deletedAt)
    .reduce((balance, movement) => balance + (movement.kind === 'deposit' ? movement.amountCOP : -movement.amountCOP), 0);
}

export function availableBusinessCapital(workday: Workday, movements: Movement[]): number {
  const scoped = movements.filter((movement) => !movement.deletedAt && movement.space === 'deliveries' && movement.workdayId === workday.id);
  const netChange = scoped.reduce((total, movement) => total + (movement.kind === 'income' ? movement.amountCOP : -movement.amountCOP), 0);
  return Math.max(workday.initialCapitalCOP + netChange - workday.savingsTransferredCOP, 0);
}

export function goalProgress(incomeCOP: number, goalCOP: number): number {
  return goalCOP > 0 ? Math.min(Math.max(incomeCOP / goalCOP, 0), 1) : 0;
}

export function remainingForGoal(incomeCOP: number, goalCOP: number): number {
  return Math.max(goalCOP - incomeCOP, 0);
}

export function validateFinancialIntegrity(data: AppData): string[] {
  const issues: string[] = [];
  for (const space of ['personal', 'deliveries'] as const) {
    const snapshot = data.accountBalances?.[space];
    if (snapshot && snapshot.accounts.reduce((sum, account) => sum + account.balance, 0) !== snapshot.total) issues.push(`El capital total de ${space} no coincide con las cuentas activas.`);
  }
  const activeBusinessWorkdays = data.workdays.filter((workday) => !workday.deletedAt && !workday.endedAt);
  if (activeBusinessWorkdays.length > 1) issues.push('Hay más de una jornada activa.');
  const activeWorkdayIds = new Set(data.workdays.filter((workday) => !workday.deletedAt).map((workday) => workday.id));
  const activeAccountIds = new Set([
    ...(data.accountBalances?.personal.accounts ?? []).map((account) => account.id),
    ...(data.accountBalances?.deliveries.accounts ?? []).map((account) => account.id),
  ]);
  for (const movement of data.movements.filter((item) => !item.deletedAt)) {
    if (!Number.isFinite(new Date(movement.occurredAt).getTime())) issues.push(`El movimiento ${movement.id} tiene fecha inválida.`);
    if (!movement.description.trim()) issues.push(`El movimiento ${movement.id} no tiene descripción.`);
    const accounts = data.accountBalances?.[movement.space].accounts ?? [];
    const validAccount = movement.accountId ? activeAccountIds.has(movement.accountId) : accounts.some((account) => account.name.toLocaleLowerCase('es-CO') === movement.paymentMethod.trim().toLocaleLowerCase('es-CO'));
    if (accounts.length && !validAccount) issues.push(`El movimiento ${movement.id} referencia una cuenta inexistente.`);
    if (movement.space === 'deliveries' && !movement.internalTransfer && (!movement.workdayId || !activeWorkdayIds.has(movement.workdayId))) issues.push(`El movimiento ${movement.id} no tiene una jornada válida.`);
  }
  if (data.businessProfitCOP !== undefined && totalsFor(data.movements.filter((item) => !item.deletedAt), 'deliveries').profitCOP !== data.businessProfitCOP) {
    issues.push('La utilidad del negocio no coincide con ingresos menos gastos de los movimientos activos.');
  }
  return [...new Set(issues)];
}

export interface DashboardSummary {
  personalMonth: Totals;
  personalRecent: Movement[];
  businessToday: Totals;
  businessGoalProgress: number;
  businessGoalRemaining: number;
  businessGoalExcess: number;
  savingsCOP: number;
  activeWorkday: Workday | undefined;
  workdayDurationMinutes: number;
  businessMovementCount: number;
  recommendations: string[];
}

export function buildDashboardSummary(data: AppData, now = new Date()): DashboardSummary {
  const today = now.toDateString();
  const month = now.getMonth();
  const year = now.getFullYear();
  const activeMovements = data.movements.filter((movement) => !movement.deletedAt);
  const personal = activeMovements.filter((movement) => movement.space === 'personal');
  const personalRecent = [...personal].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 5);
  const personalMonth = personal.filter((movement) => {
    const date = new Date(movement.occurredAt);
    return date.getMonth() === month && date.getFullYear() === year;
  });
  const businessToday = activeMovements.filter((movement) => movement.space === 'deliveries' && new Date(movement.occurredAt).toDateString() === today);
  const totals = totalsFor(businessToday);
  const goalProgressValue = goalProgress(totals.incomeCOP, data.settings.dailyGoalCOP);
  const remaining = remainingForGoal(totals.incomeCOP, data.settings.dailyGoalCOP);
  const excess = Math.max(totals.incomeCOP - data.settings.dailyGoalCOP, 0);
  const activeWorkday = data.workdays.find((workday) => !workday.deletedAt && workday.endedAt === null);
  const lastWorkday = activeWorkday ?? data.workdays.find((workday) => !workday.deletedAt && workday.endedAt !== null);
  const workdayEnd = lastWorkday?.endedAt ? new Date(lastWorkday.endedAt) : now;
  const workdayDurationMinutes = lastWorkday
    ? Math.max(0, Math.floor((workdayEnd.getTime() - new Date(lastWorkday.startedAt).getTime()) / 60_000))
    : 0;
  const savingsCOP = savingsBalance(data.savings.filter((movement) => !movement.deletedAt));
  const recommendations: string[] = [];
  if (totals.incomeCOP >= data.settings.dailyGoalCOP && data.settings.dailyGoalCOP > 0) {
    recommendations.push(excess > 0 ? `Meta alcanzada: superaste el objetivo por ${excess.toLocaleString('es-CO')} COP.` : 'Meta diaria alcanzada.');
  } else if (totals.incomeCOP > 0 && goalProgressValue >= 0.8) {
    recommendations.push(`Vas en ${Math.round(goalProgressValue * 100)}% de tu meta; faltan ${remaining.toLocaleString('es-CO')} COP.`);
  } else if (totals.incomeCOP > 0) {
    recommendations.push(`Te faltan ${remaining.toLocaleString('es-CO')} COP para alcanzar la meta diaria.`);
  }
  const previousWeek = buildReport(activeMovements, data.savings, 'week', data.settings.dailyGoalCOP, previousReportAnchor('week', now));
  const currentWeek = buildReport(activeMovements, data.savings, 'week', data.settings.dailyGoalCOP, now);
  if (previousWeek.incomeCOP > 0 && currentWeek.incomeCOP > previousWeek.incomeCOP) {
    recommendations.push('Esta semana tus ingresos superan los de la semana anterior.');
  }
  if (previousWeek.savingsCOP > 0 && currentWeek.savingsCOP > previousWeek.savingsCOP) {
    recommendations.push('El ahorro de esta semana aumentó respecto a la semana anterior.');
  }
  const currentMonthStart = startOfRange('month', now);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const personalExpensesIn = (from: Date, to: Date) => personal.filter((movement) => movement.kind === 'expense' &&
    new Date(movement.occurredAt) >= from && new Date(movement.occurredAt) < to).reduce((sum, movement) => sum + movement.amountCOP, 0);
  const currentPersonalExpenses = personalExpensesIn(currentMonthStart, new Date(now.getTime() + 1));
  const previousPersonalExpenses = personalExpensesIn(previousMonthStart, currentMonthStart);
  if (previousPersonalExpenses > 0 && currentPersonalExpenses > previousPersonalExpenses) {
    recommendations.push('Tus gastos personales de este mes superan los del mes anterior.');
  }
  const weekStart = startOfRange('week', now);
  const fourWeeksStart = new Date(weekStart); fourWeeksStart.setDate(fourWeeksStart.getDate() - 28);
  const isGasoline = (movement: Movement) => movement.category.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CO').includes('gasolina');
  const weeklyGasolineAverage = activeMovements.filter((movement) => movement.space === 'deliveries' && movement.kind === 'expense' && isGasoline(movement) &&
    new Date(movement.occurredAt) >= fourWeeksStart && new Date(movement.occurredAt) < weekStart).reduce((sum, movement) => sum + movement.amountCOP, 0) / 4;
  const elapsedWeekDays = Math.max(1, Math.ceil((now.getTime() - weekStart.getTime()) / 86_400_000));
  const currentGasolineSpend = activeMovements.filter((movement) => movement.space === 'deliveries' && movement.kind === 'expense' && isGasoline(movement) &&
    new Date(movement.occurredAt) >= weekStart && new Date(movement.occurredAt) <= now).reduce((sum, movement) => sum + movement.amountCOP, 0);
  if (weeklyGasolineAverage > 0 && currentGasolineSpend / elapsedWeekDays * 7 > weeklyGasolineAverage) {
    recommendations.push('El gasto en gasolina va por encima de tu promedio semanal reciente.');
  }
  return {
    personalMonth: totalsFor(personalMonth), personalRecent, businessToday: totals,
    businessGoalProgress: goalProgressValue, businessGoalRemaining: remaining, businessGoalExcess: excess,
    savingsCOP, activeWorkday, workdayDurationMinutes, businessMovementCount: businessToday.length, recommendations,
  };
}

function startOfRange(range: ReportRange, now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'day') return start;
  if (range === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    return start;
  }
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), 0, 1);
}

export interface ReportSummary extends Totals {
  savingsCOP: number;
  incomeByAccount: Record<string, number>;
  expensesByAccount: Record<string, number>;
  averageDailyProfitCOP: number;
  bestDay: { date: string; profitCOP: number } | null;
  worstDay: { date: string; profitCOP: number } | null;
  goalReachedDays: number;
  daily: { date: string; incomeCOP: number; expenseCOP: number; profitCOP: number }[];
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function buildReport(
  movements: Movement[],
  savings: { kind: 'deposit' | 'withdrawal'; amountCOP: number; occurredAt: string; deletedAt?: string | null }[],
  range: ReportRange,
  goalCOP: number,
  now = new Date(),
): ReportSummary {
  const start = startOfRange(range, now);
  const scoped = movements.filter((movement) => movement.space === 'deliveries' && !movement.deletedAt && new Date(movement.occurredAt) >= start && new Date(movement.occurredAt) <= now);
  const incomeByAccount: Record<string, number> = {};
  const expensesByAccount: Record<string, number> = {};
  const byDay = new Map<string, { date: string; incomeCOP: number; expenseCOP: number; profitCOP: number }>();
  for (const movement of scoped) {
    const account = movement.paymentMethod || 'Sin cuenta';
    const key = dateKey(new Date(movement.occurredAt));
    const day = byDay.get(key) ?? { date: key, incomeCOP: 0, expenseCOP: 0, profitCOP: 0 };
    if (movement.kind === 'income') {
      day.incomeCOP += movement.amountCOP;
      incomeByAccount[account] = (incomeByAccount[account] ?? 0) + movement.amountCOP;
    } else {
      day.expenseCOP += movement.amountCOP;
      expensesByAccount[account] = (expensesByAccount[account] ?? 0) + movement.amountCOP;
    }
    day.profitCOP = day.incomeCOP - day.expenseCOP;
    byDay.set(key, day);
  }
  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totals = totalsFor(scoped);
  const todayKey = dateKey(now);
  const elapsedDays = Math.max(Math.floor((new Date(`${todayKey}T00:00:00`).getTime() - start.getTime()) / 86_400_000) + 1, 1);
  const savingPeriod = savings.filter((item) => !item.deletedAt && new Date(item.occurredAt) >= start && new Date(item.occurredAt) <= now);
  const savingsCOP = savingPeriod.reduce((sum, item) => sum + (item.kind === 'deposit' ? item.amountCOP : -item.amountCOP), 0);
  const bestDay = daily.length ? daily.reduce((best, day) => day.profitCOP > best.profitCOP ? day : best) : null;
  const worstDay = daily.length ? daily.reduce((worst, day) => day.profitCOP < worst.profitCOP ? day : worst) : null;

  return {
    ...totals,
    savingsCOP,
    incomeByAccount,
    expensesByAccount,
    averageDailyProfitCOP: totals.profitCOP / elapsedDays,
    bestDay,
    worstDay,
    goalReachedDays: daily.filter((day) => day.incomeCOP >= goalCOP).length,
    daily,
  };
}

export function previousReportAnchor(range: ReportRange, now = new Date()): Date {
  const previous = new Date(now);
  if (range === 'day') previous.setDate(previous.getDate() - 1);
  else if (range === 'week') previous.setDate(previous.getDate() - 7);
  else if (range === 'month') return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), now.getHours(), now.getMinutes());
  else previous.setFullYear(previous.getFullYear() - 1);
  return previous;
}

export interface FinancialReportPoint {
  label: string;
  incomeCOP: number;
  expenseCOP: number;
  profitCOP: number;
  capitalCOP: number;
  savingsCOP: number;
  cashCOP: number;
  nequiCOP: number;
  goalCOP: number;
  goalActualCOP: number;
}

export interface FinancialReportAnalytics {
  points: FinancialReportPoint[];
  expenseCategories: { name: string; value: number }[];
  initialCapitalCOP: number;
  finalCapitalCOP: number;
  movementCount: number;
  workedMinutes: number;
  highestIncomeDay: { date: string; incomeCOP: number } | null;
  highestExpenseDay: { date: string; expenseCOP: number } | null;
}

export interface ReportExportRecord {
  date: string;
  module: string;
  type: string;
  description: string;
  category: string;
  account: string;
  amountCOP: number;
}

export interface GlobalSearchResult {
  id: string;
  type: 'movement' | 'journey' | 'transfer' | 'saving' | 'report';
  title: string;
  detail: string;
  date: string;
  amountCOP?: number;
  movement?: Movement;
  destination?: string;
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CO');
}

export function searchLedger(data: AppData, query: string, now = new Date()): GlobalSearchResult[] {
  const normalized = normalizeSearchText(query.trim());
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter(Boolean);
  const accountName = (id: string | undefined, space: LedgerSpace) =>
    data.accountBalances?.[space].accounts.find((account) => account.id === id)?.name ?? '';
  const candidates: GlobalSearchResult[] = [];
  for (const movement of data.movements.filter((item) => !item.deletedAt)) candidates.push({
    id: movement.id, type: 'movement', title: movement.description,
    detail: `${movement.space === 'personal' ? 'Personal' : 'Negocio'} · ${movement.kind === 'income' ? 'Ingreso' : 'Gasto'} · ${movement.category} · ${movement.paymentMethod}`,
    date: movement.occurredAt, amountCOP: movement.amountCOP, movement,
  });
  for (const workday of data.workdays.filter((item) => !item.deletedAt)) candidates.push({
    id: workday.id, type: 'journey', title: `Jornada ${workday.endedAt ? 'finalizada' : 'abierta'}`,
    detail: `Capital inicial ${formatCOP(workday.initialCapitalCOP)} · ${workday.endedAt ? 'Cerrada' : 'En curso'} · ${Object.entries(workday.initialCapitalByAccount ?? {}).map(([id, amount]) => `${accountName(id, 'deliveries')} ${formatCOP(amount)}`).join(' ')}`,
    date: workday.startedAt, amountCOP: workday.initialCapitalCOP, destination: '/business/journey',
  });
  const uniqueTransfers = [...new Map([...(data.transfers?.personal ?? []), ...(data.transfers?.deliveries ?? [])].map((transfer) => [transfer.id, transfer])).values()];
  for (const transfer of uniqueTransfers) {
    if (transfer.deletedAt) continue;
    const sourceModule = transfer.sourceModule ?? transfer.module;
    const destinationModule = transfer.destinationModule ?? transfer.module;
    const sourceSpace = sourceModule === 'personal' ? 'personal' : 'deliveries';
    const destinationSpace = destinationModule === 'personal' ? 'personal' : 'deliveries';
    candidates.push({
      id: transfer.id, type: 'transfer', title: transfer.description,
      detail: `Transferencia ${accountName(transfer.sourceAccountId, sourceSpace)} → ${accountName(transfer.destinationAccountId, destinationSpace)}`,
      date: transfer.date, amountCOP: transfer.amount, destination: destinationSpace === 'personal' ? '/personal' : '/business',
    });
  }
  for (const saving of data.savings.filter((item) => !item.deletedAt)) candidates.push({
    id: saving.id, type: 'saving', title: saving.kind === 'deposit' ? 'Depósito de ahorro' : 'Retiro de ahorro',
    detail: `${saving.note} · ${accountName(saving.accountId, 'deliveries')}`, date: saving.occurredAt, amountCOP: saving.amountCOP, destination: '/business/savings',
  });
  for (const { key, label } of [{ key: 'day', label: 'Diario' }, { key: 'week', label: 'Semanal' }, { key: 'month', label: 'Mensual' }, { key: 'year', label: 'Anual' }] as const) {
    const summary = buildReport(data.movements, data.savings, key, data.settings.dailyGoalCOP, now);
    candidates.push({ id: `report-${key}`, type: 'report', title: `Reporte ${label}`, detail: `Ingresos ${formatCOP(summary.incomeCOP)} · Gastos ${formatCOP(summary.expenseCOP)}`, date: now.toISOString(), amountCOP: summary.profitCOP, destination: '/reports' });
  }
  return candidates.filter((candidate) => {
    const searchable = normalizeSearchText([candidate.title, candidate.detail, candidate.date, candidate.amountCOP === undefined ? '' : `${candidate.amountCOP} ${formatCOP(candidate.amountCOP)}`].join(' '));
    return words.every((word) => searchable.includes(word));
  }).sort((left, right) => right.date.localeCompare(left.date)).slice(0, 20);
}

export function buildReportExportRows(data: AppData, from: string, to: string): ReportExportRecord[] {
  const start = new Date(`${from}T00:00:00`);
  const endExclusive = new Date(`${to}T00:00:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime()) || start >= endExclusive) return [];
  const rows: ReportExportRecord[] = data.movements.filter((item) => !item.deletedAt && new Date(item.occurredAt) >= start && new Date(item.occurredAt) < endExclusive).map((item) => ({
    date: item.occurredAt, module: item.space === 'personal' ? 'Finanzas personales' : 'Negocio',
    type: item.kind === 'income' ? 'Ingreso' : 'Gasto', description: item.description,
    category: item.category, account: item.paymentMethod, amountCOP: item.amountCOP,
  }));
  for (const item of data.savings.filter((saving) => !saving.deletedAt && new Date(saving.occurredAt) >= start && new Date(saving.occurredAt) < endExclusive)) {
    rows.push({ date: item.occurredAt, module: 'Ahorro del negocio', type: item.kind === 'deposit' ? 'Depósito' : 'Retiro', description: item.note, category: 'Ahorro', account: item.accountId ?? 'Efectivo', amountCOP: item.amountCOP });
  }
  const uniqueTransfers = [...new Map([...(data.transfers?.personal ?? []), ...(data.transfers?.deliveries ?? [])].map((transfer) => [transfer.id, transfer])).values()];
  for (const transfer of uniqueTransfers.filter((item) => !item.deletedAt && new Date(item.date) >= start && new Date(item.date) < endExclusive)) {
    rows.push({ date: transfer.date, module: transfer.module === 'business' ? 'Negocio' : 'Finanzas personales', type: 'Transferencia', description: transfer.description, category: 'Transferencia interna', account: `${transfer.sourceAccountId} → ${transfer.destinationAccountId}`, amountCOP: transfer.amount });
  }
  return rows.sort((left, right) => left.date.localeCompare(right.date));
}

export function buildFinancialReportAnalytics(data: AppData, range: ReportRange, now = new Date()): FinancialReportAnalytics {
  const start = startOfRange(range, now);
  const business = data.movements.filter((movement) => movement.space === 'deliveries' && !movement.deletedAt);
  const savings = data.savings.filter((movement) => !movement.deletedAt);
  const inPeriod = business.filter((movement) => new Date(movement.occurredAt) >= start && new Date(movement.occurredAt) <= now);
  const categories = new Map<string, number>();
  for (const movement of inPeriod) {
    if (movement.kind === 'expense') categories.set(movement.category || 'Sin categoría', (categories.get(movement.category || 'Sin categoría') ?? 0) + movement.amountCOP);
  }
  const accounts = data.accountBalances?.deliveries.accounts ?? [];
  const cashAccounts = accounts.filter((account) => account.name.toLocaleLowerCase('es-CO') === 'efectivo');
  const cashAccount = cashAccounts[0];
  const nequiAccount = accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === 'nequi');
  const earliestJourney = [...data.workdays].filter((item) => !item.deletedAt).sort((left, right) => left.startedAt.localeCompare(right.startedAt))[0];
  const movementIsAfterCapitalBaseline = (movement: Movement) =>
    !earliestJourney || movement.occurredAt >= earliestJourney.startedAt || movement.workdayId === earliestJourney.id;

  const periods: { label: string; start: Date; end: Date }[] = [];
  if (range === 'day') {
    for (let hour = 0; hour < 24; hour++) periods.push({ label: `${String(hour).padStart(2, '0')}:00`, start: new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour), end: new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour + 1) });
  } else if (range === 'week') {
    for (let day = 0; day < 7; day++) {
      const periodStart = new Date(start); periodStart.setDate(start.getDate() + day);
      const periodEnd = new Date(periodStart); periodEnd.setDate(periodEnd.getDate() + 1);
      periods.push({ label: new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(periodStart), start: periodStart, end: periodEnd });
    }
  } else if (range === 'month') {
    for (let week = 0; week < 5; week++) {
      const periodStart = new Date(start); periodStart.setDate(1 + week * 7);
      const periodEnd = new Date(periodStart); periodEnd.setDate(periodEnd.getDate() + 7);
      periods.push({ label: `Sem. ${week + 1}`, start: periodStart, end: periodEnd });
    }
  } else {
    for (let month = 0; month < 12; month++) {
      const periodStart = new Date(start.getFullYear(), month, 1);
      periods.push({ label: new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(periodStart), start: periodStart, end: new Date(start.getFullYear(), month + 1, 1) });
    }
  }

  function balanceAt(date: Date): { capital: number; saving: number; cash: number; nequi: number } {
    const balances = new Map(accounts.map((account) => [account.id, account.balance]));
    const currentTime = now.getTime();
    const targetTime = date.getTime();
    let savingBalance = savingsBalance(savings);
    const timeline = [
      ...business.filter((movement) => new Date(movement.occurredAt).getTime() > targetTime && new Date(movement.occurredAt).getTime() <= currentTime && movementIsAfterCapitalBaseline(movement)).map((movement) => ({ date: movement.occurredAt, kind: 'movement' as const, value: movement })),
      ...savings.filter((movement) => new Date(movement.occurredAt).getTime() > targetTime && new Date(movement.occurredAt).getTime() <= currentTime && (!earliestJourney || movement.occurredAt >= earliestJourney.startedAt)).map((movement) => ({ date: movement.occurredAt, kind: 'saving' as const, value: movement })),
      ...(data.transfers?.deliveries ?? []).filter((transfer) => !transfer.deletedAt && new Date(transfer.date).getTime() > targetTime && new Date(transfer.date).getTime() <= currentTime && (!earliestJourney || transfer.date >= earliestJourney.startedAt)).map((transfer) => ({ date: transfer.date, kind: 'transfer' as const, value: transfer })),
    ].sort((left, right) => right.date.localeCompare(left.date));
    for (const item of timeline) {
      if (item.kind === 'movement') {
        const movement = item.value;
        const normalizedPaymentMethod = movement.paymentMethod.trim().toLocaleLowerCase('es-CO');
        const id = movement.accountId ?? accounts.find((account) => account.name.trim().toLocaleLowerCase('es-CO') === normalizedPaymentMethod)?.id;
        if (id) balances.set(id, (balances.get(id) ?? 0) - (movement.kind === 'income' ? movement.amountCOP : -movement.amountCOP));
      } else if (item.kind === 'saving') {
        const saving = item.value;
        const delta = saving.kind === 'deposit' ? saving.amountCOP : -saving.amountCOP;
        savingBalance -= delta;
        const accountId = saving.accountId ?? cashAccount?.id;
        if (accountId) balances.set(accountId, (balances.get(accountId) ?? 0) + delta);
      } else {
        const transfer = item.value;
        balances.set(transfer.sourceAccountId, (balances.get(transfer.sourceAccountId) ?? 0) + transfer.amount);
        balances.set(transfer.destinationAccountId, (balances.get(transfer.destinationAccountId) ?? 0) - transfer.amount);
      }
    }
    return {
      capital: [...balances.values()].reduce((sum, value) => sum + value, 0), saving: savingBalance,
      cash: cashAccounts.reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0),
      nequi: nequiAccount ? balances.get(nequiAccount.id) ?? 0 : 0,
    };
  }

  const points = periods.filter((period) => period.start <= now).map((period) => {
    const end = period.end > now ? now : period.end;
    const moves = inPeriod.filter((movement) => new Date(movement.occurredAt) >= period.start && new Date(movement.occurredAt) < period.end);
    const incomeCOP = moves.filter((movement) => movement.kind === 'income').reduce((sum, movement) => sum + movement.amountCOP, 0);
    const expenseCOP = moves.filter((movement) => movement.kind === 'expense').reduce((sum, movement) => sum + movement.amountCOP, 0);
    const goalActualCOP = range === 'day'
      ? inPeriod.filter((movement) => movement.kind === 'income' && new Date(movement.occurredAt) < period.end).reduce((sum, movement) => sum + movement.amountCOP, 0)
      : incomeCOP;
    let periodDays = 1;
    if (range === 'month') {
      const monthEnd = new Date(period.start.getFullYear(), period.start.getMonth() + 1, 1);
      periodDays = Math.max(1, Math.ceil((Math.min(period.end.getTime(), monthEnd.getTime()) - period.start.getTime()) / 86_400_000));
    }
    if (range === 'year') periodDays = new Date(period.start.getFullYear(), period.start.getMonth() + 1, 0).getDate();
    const balance = balanceAt(end);
    return { label: period.label, incomeCOP, expenseCOP, profitCOP: incomeCOP - expenseCOP, capitalCOP: balance.capital, savingsCOP: balance.saving, cashCOP: balance.cash, nequiCOP: balance.nequi, goalCOP: data.settings.dailyGoalCOP * periodDays, goalActualCOP };
  });
  const daily = new Map<string, { date: string; incomeCOP: number; expenseCOP: number }>();
  for (const movement of inPeriod) {
    const date = dateKey(new Date(movement.occurredAt));
    const entry = daily.get(date) ?? { date, incomeCOP: 0, expenseCOP: 0 };
    if (movement.kind === 'income') entry.incomeCOP += movement.amountCOP;
    else entry.expenseCOP += movement.amountCOP;
    daily.set(date, entry);
  }
  const days = [...daily.values()];
  const firstBalance = balanceAt(start);
  const finalBalance = balanceAt(now);
  const workedMinutes = data.workdays.reduce((total, workday) => {
    const dayStart = new Date(workday.startedAt);
    const dayEnd = workday.endedAt ? new Date(workday.endedAt) : now;
    const overlap = Math.max(0, Math.min(dayEnd.getTime(), now.getTime()) - Math.max(dayStart.getTime(), start.getTime()));
    return total + Math.floor(overlap / 60_000);
  }, 0);
  return {
    points, expenseCategories: [...categories].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    initialCapitalCOP: firstBalance.capital, finalCapitalCOP: finalBalance.capital,
    movementCount: inPeriod.length,
    workedMinutes,
    highestIncomeDay: days.length ? days.reduce((best, day) => day.incomeCOP > best.incomeCOP ? day : best) : null,
    highestExpenseDay: days.length ? days.reduce((best, day) => day.expenseCOP > best.expenseCOP ? day : best) : null,
  };
}
