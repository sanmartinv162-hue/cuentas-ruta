import { z } from 'zod';

const accountTransferFields = z.object({
  id: z.string().uuid(),
  module: z.enum(['personal', 'business']),
  sourceModule: z.enum(['personal', 'business']).optional(),
  destinationModule: z.enum(['personal', 'business']).optional(),
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  description: z.string().trim().min(1).max(240),
  date: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
});

export const accountTransferSchema = accountTransferFields.superRefine((transfer, context) => {
  if (transfer.sourceAccountId === transfer.destinationAccountId) {
    context.addIssue({ code: 'custom', path: ['destinationAccountId'], message: 'El origen y el destino deben ser cuentas distintas.' });
  }
});

export const accountTransferInputSchema = accountTransferFields.omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true }).extend({ date: z.iso.datetime().optional() });

export type AccountTransfer = z.infer<typeof accountTransferSchema>;
export type AccountTransferInput = z.infer<typeof accountTransferInputSchema>;
