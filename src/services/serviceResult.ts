import { ZodError } from 'zod';
import { RepositoryError } from '../repositories/base.repository';
import { logger } from '../utils/logger';

export type ServiceErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'INSUFFICIENT_FUNDS' | 'DATABASE' | 'UNKNOWN';

export class ServiceError extends Error {
  constructor(readonly code: ServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ServiceError';
  }
}

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

export async function executeService<T>(operation: string, action: () => Promise<T>): Promise<ServiceResult<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (cause) {
    const error = cause instanceof ServiceError
      ? cause
      : cause instanceof RepositoryError
        ? new ServiceError(cause.code === 'NOT_FOUND' ? 'NOT_FOUND' : cause.code === 'CONFLICT' ? 'CONFLICT' : cause.code === 'VALIDATION' ? 'VALIDATION' : 'DATABASE', cause.message, { cause })
        : cause instanceof ZodError
          ? new ServiceError('VALIDATION', 'Los datos no cumplen las reglas de validación.', { cause })
        : new ServiceError('UNKNOWN', 'No se pudo completar la operación.', { cause });
    logger.error(`service.${operation}.failed`, cause, { code: error.code });
    return { ok: false, error };
  }
}

export function unwrapServiceResult<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}
