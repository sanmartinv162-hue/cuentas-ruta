import { z } from 'zod';

export const settingsSchema = z.object({
  id: z.literal('global'),
  dailyGoal: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/, 'La moneda debe ser un código ISO de tres letras.'),
  theme: z.enum(['light', 'dark', 'system']),
  businessInitialCapital: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  businessInitialCapitalByAccount: z.record(z.string().uuid(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)).optional(),
  personalInitialCapitalByAccount: z.record(z.string().uuid(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)).optional(),
  businessSaving: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
});

export type Settings = z.infer<typeof settingsSchema>;
