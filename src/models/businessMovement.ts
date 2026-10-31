import { z } from 'zod';

const businessMovementFields = z.object({
  id: z.string().uuid(),
  transferId: z.string().uuid().optional(),
  internalTransfer: z.boolean().optional(),
  journeyId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  deliveryCount: z.number().int().min(0).max(99).optional().default(0),
  deliveryFeeReserveCOP: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  deliveryFeePayment: z.boolean().optional(),
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

const deliveryFeePaymentRefinement = (
  movement: { type?: 'income' | 'expense'; deliveryFeeReserveCOP?: number; deliveryFeePayment?: boolean },
  context: z.RefinementCtx,
) => {
  if (movement.deliveryFeePayment && movement.type !== 'expense') {
    context.addIssue({ code: 'custom', path: ['deliveryFeePayment'], message: 'El pago de domicilios debe ser un gasto.' });
  }
  if (movement.deliveryFeeReserveCOP !== undefined && movement.type !== 'income') {
    context.addIssue({ code: 'custom', path: ['deliveryFeeReserveCOP'], message: 'El apartado del líder solo puede pertenecer a un ingreso.' });
  }
};

export const businessMovementSchema = businessMovementFields.superRefine(deliveryFeePaymentRefinement);

const businessMovementInputFields = businessMovementFields.omit({
  id: true, journeyId: true, createdAt: true, updatedAt: true, deletedAt: true,
  version: true, synced: true, syncVersion: true, deviceId: true, deliveryFeeReserveCOP: true,
}).extend({ detectedCategory: z.string().trim().max(100).optional().default('') });

export const businessMovementInputSchema = businessMovementInputFields.superRefine(deliveryFeePaymentRefinement);
export const businessMovementUpdateSchema = businessMovementInputFields.partial().strict().superRefine(deliveryFeePaymentRefinement);

export type BusinessMovement = z.infer<typeof businessMovementSchema>;
export type BusinessMovementInput = z.infer<typeof businessMovementInputSchema>;
