import { journeySchema } from '../models/journey';

/** Valida una jornada y sus invariantes financieras derivadas. */
export function validateJourney(value: unknown) {
  return journeySchema.safeParse(value);
}
