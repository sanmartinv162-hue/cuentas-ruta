import { z } from 'zod';

export function normalizeFinancialAccountName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('es-CO');
}

export const financialAccountSchema = z.object({
  id: z.string().uuid(),
  module: z.enum(['personal', 'business']),
  name: z.string().trim().min(1).max(64),
  normalizedName: z.string().min(1).max(64),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
});

export type FinancialAccount = z.infer<typeof financialAccountSchema>;
