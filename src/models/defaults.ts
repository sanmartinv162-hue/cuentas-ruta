import type { AppData, AppSettings, LedgerSpace } from '../types';

export const STORAGE_KEY = 'cuentas-ruta.data.v1';

export const defaultSettings: AppSettings = {
  dailyGoalCOP: 100_000,
  startingCapitalCOP: 0,
  paymentMethods: ['Nequi', 'Efectivo'],
  currency: 'COP',
  theme: 'system',
  learnedCategories: { personal: {}, deliveries: {} },
};

export function createEmptyData(): AppData {
  return { schemaVersion: 1, movements: [], workdays: [], savings: [], settings: structuredClone(defaultSettings) };
}

export function spaceLabel(space: LedgerSpace): string {
  return space === 'personal' ? 'Finanzas personales' : 'Negocio de domicilios';
}
