import { businessMovementSchema } from '../models/businessMovement';

/** Valida movimientos del negocio y exige una jornada asociada. */
export function validateBusinessMovement(value: unknown) {
  return businessMovementSchema.safeParse(value);
}
