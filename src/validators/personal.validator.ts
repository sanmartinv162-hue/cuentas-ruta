import { personalMovementSchema } from '../models/personalMovement';

/** Valida datos no confiables antes de guardarlos como movimiento personal. */
export function validatePersonalMovement(value: unknown) {
  return personalMovementSchema.safeParse(value);
}
