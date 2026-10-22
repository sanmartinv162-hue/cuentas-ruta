import { z } from 'zod';

export const businessMovementSchema = z.object({
  id: z.string().uuid(),
  transferId: z.string().uuid().optional(),
  internalTransfer: z.boolean().optional(),
  journeyId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  deliveryCount: z.number().int().min(0).max(99).optional().default(0),
  type: z.enum(['income', 'expense']),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  description: z.string().trim().min(1).max(240),
  paymentMethod: z.string().trim().min(1).max(64),
  detectedCategory: z.string().trim().max(100),
  date: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable().optional(),
  version: z.number().int().positive(),
  synced: z.boolean(),
  syncVersion: z.number().int().nonnegative(),
  deviceId: z.string().min(1).max(80),
});

export const businessMovementInputSchema = businessMovementSchema.omit({
  id: true, journeyId: true, createdAt: true, updatedAt: true, deletedAt: true,
  version: true, synced: true, syncVersion: true, deviceId: true,
}).extend({ detectedCategory: z.string().trim().max(100).optional().default('') });

export const businessMovementUpdateSchema = businessMovementInputSchema.partial().strict();

export type BusinessMovement = z.infer<typeof businessMovementSchema>;
export type BusinessMovementInput = z.infer<typeof businessMovementInputSchema>;
