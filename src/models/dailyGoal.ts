import { z } from 'zod';

export const dailyGoalSchema = z.object({
  id: z.string().uuid(),
  goal: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  current: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  remaining: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  percentage: z.number().min(0).max(100),
  completed: z.boolean(),
  date: z.iso.date(),
  deletedAt: z.iso.datetime().nullable().optional(),
}).superRefine((dailyGoal, context) => {
  const expectedRemaining = Math.max(dailyGoal.goal - dailyGoal.current, 0);
  const expectedPercentage = Math.min(dailyGoal.current / dailyGoal.goal * 100, 100);
  if (dailyGoal.remaining !== expectedRemaining) {
    context.addIssue({ code: 'custom', path: ['remaining'], message: 'El valor restante no coincide con la meta.' });
  }
  if (Math.abs(dailyGoal.percentage - expectedPercentage) > 0.0001) {
    context.addIssue({ code: 'custom', path: ['percentage'], message: 'El porcentaje no coincide con el ingreso actual.' });
  }
  if (dailyGoal.completed !== (dailyGoal.current >= dailyGoal.goal)) {
    context.addIssue({ code: 'custom', path: ['completed'], message: 'El estado de cumplimiento no coincide con la meta.' });
  }
});

export type DailyGoal = z.infer<typeof dailyGoalSchema>;
