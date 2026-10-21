import { z } from 'zod';

export const classificationRuleSchema = z.object({
  id: z.string().uuid(),
  keyword: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  timesUsed: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
});

export type ClassificationRule = z.infer<typeof classificationRuleSchema>;
