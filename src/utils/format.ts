import type { ReportRange } from '../types';

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

export function parseCOP(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function localDateTimeValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha inválida' : new Intl.DateTimeFormat('es-CO', options).format(date);
}

export function rangeLabel(range: ReportRange): string {
  return ({ day: 'Hoy', week: 'Esta semana', month: 'Este mes', year: 'Este año' })[range];
}
