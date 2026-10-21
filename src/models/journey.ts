import { z } from 'zod';

const nonNegativeMoney = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const journeySchema = z.object({
  id: z.string().uuid(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime().nullable(),
  initialCapital: nonNegativeMoney,
  initialCapitalByAccount: z.record(z.string().uuid(), nonNegativeMoney).optional(),
  finalCapital: nonNegativeMoney,
  finalCapitalByAccount: z.record(z.string().uuid(), nonNegativeMoney).optional(),
  income: nonNegativeMoney,
  incomeByAccount: z.record(z.string().uuid(), nonNegativeMoney).optional(),
  expenses: nonNegativeMoney,
  expensesByAccount: z.record(z.string().uuid(), nonNegativeMoney).optional(),
  profit: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  savingTransferred: nonNegativeMoney,
  goalAmount: nonNegativeMoney,
  goalProgress: z.number().min(0).max(100),
  goalReached: z.boolean(),
  status: z.enum(['active', 'closed']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
}).superRefine((journey, context) => {
  if (journey.profit !== journey.income - journey.expenses) {
    context.addIssue({ code: 'custom', path: ['profit'], message: 'La utilidad debe ser igual a ingresos menos gastos.' });
  }
  const capitalAvailableForSavings = journey.initialCapitalByAccount
    ? Object.values(journey.initialCapitalByAccount).reduce((total, balance) => total + balance, 0) + journey.profit
    : journey.initialCapital + journey.profit;
  if (journey.savingTransferred > Math.max(capitalAvailableForSavings, 0)) {
    context.addIssue({ code: 'custom', path: ['savingTransferred'], message: 'El ahorro transferido supera el capital disponible.' });
  }
  const expectedFinalCapital = journey.finalCapitalByAccount
    ? Object.values(journey.finalCapitalByAccount).reduce((total, balance) => total + balance, 0)
    : Math.max(journey.initialCapital + journey.profit - journey.savingTransferred, 0);
  if (journey.finalCapital !== expectedFinalCapital) {
    context.addIssue({ code: 'custom', path: ['finalCapital'], message: 'El capital final no coincide con el cierre calculado.' });
  }
  const expectedGoalProgress = journey.goalAmount > 0 ? Math.min(journey.income / journey.goalAmount * 100, 100) : 0;
  if (Math.abs(journey.goalProgress - expectedGoalProgress) > 0.0001) {
    context.addIssue({ code: 'custom', path: ['goalProgress'], message: 'El progreso no coincide con los ingresos y la meta.' });
  }
  if (journey.goalReached !== (journey.goalAmount > 0 && journey.income >= journey.goalAmount)) {
    context.addIssue({ code: 'custom', path: ['goalReached'], message: 'El estado de meta no coincide con los ingresos.' });
  }
  if ((journey.status === 'active') !== (journey.endTime === null)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'El estado y la fecha de cierre de la jornada no coinciden.' });
  }
  if (journey.endTime && new Date(journey.endTime) < new Date(journey.startTime)) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'La jornada no puede finalizar antes de iniciar.' });
  }
});

export type Journey = z.infer<typeof journeySchema>;
