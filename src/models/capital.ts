import { z } from 'zod';

export const capitalSchema = z.object({
  id: z.literal('current'),
  currentCapital: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  availableCapital: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  totalSavings: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  totalProfit: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.iso.datetime(),
}).refine((capital) => capital.currentCapital === capital.availableCapital + capital.totalSavings, {
  path: ['currentCapital'],
  message: 'El capital actual debe ser igual al disponible más el ahorro.',
});

export type Capital = z.infer<typeof capitalSchema>;
