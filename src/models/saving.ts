import { z } from 'zod';

export const savingSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['deposit', 'withdraw']),
  accountId: z.string().uuid().optional(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  description: z.string().trim().min(1).max(240),
  balanceAfter: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  date: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
});

export type Saving = z.infer<typeof savingSchema>;
