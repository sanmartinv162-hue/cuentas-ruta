import { createEmptyData, STORAGE_KEY, defaultSettings } from '../models/defaults';
import { ledgerDatabase } from './ledgerDatabase';
import type { AppData } from '../types';

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AppData>;
  const settings = data.settings;
  const validSettings = !!settings && typeof settings === 'object' &&
    Number.isSafeInteger(settings.dailyGoalCOP) && settings.dailyGoalCOP! > 0 &&
    Number.isSafeInteger(settings.startingCapitalCOP) && settings.startingCapitalCOP! >= 0 &&
    Array.isArray(settings.paymentMethods) && settings.paymentMethods.every((method) => typeof method === 'string') &&
    !!settings.learnedCategories && typeof settings.learnedCategories === 'object';
  const validMovement = (item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const movement = item as AppData['movements'][number];
    return typeof movement.id === 'string' && (movement.space === 'personal' || movement.space === 'deliveries') &&
      (movement.kind === 'income' || movement.kind === 'expense') && Number.isSafeInteger(movement.amountCOP) && movement.amountCOP > 0 &&
      typeof movement.description === 'string' && typeof movement.occurredAt === 'string' && !Number.isNaN(Date.parse(movement.occurredAt)) &&
      typeof movement.paymentMethod === 'string' && typeof movement.category === 'string';
  };
  const validSaving = (item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const saving = item as AppData['savings'][number];
    return typeof saving.id === 'string' && (saving.kind === 'deposit' || saving.kind === 'withdrawal') &&
      Number.isSafeInteger(saving.amountCOP) && saving.amountCOP > 0 && typeof saving.occurredAt === 'string' &&
      !Number.isNaN(Date.parse(saving.occurredAt)) && typeof saving.note === 'string';
  };
  const validTransfers = !data.transfers || (['personal', 'deliveries'] as const).every((space) =>
    Array.isArray(data.transfers?.[space]) && data.transfers[space]!.every((transfer) =>
      typeof transfer.id === 'string' && typeof transfer.sourceAccountId === 'string' &&
      typeof transfer.destinationAccountId === 'string' && Number.isSafeInteger(transfer.amount) && transfer.amount > 0 &&
      typeof transfer.description === 'string' && !Number.isNaN(Date.parse(transfer.date)),
    ),
  );
  return data.schemaVersion === 1 && Array.isArray(data.movements) && data.movements.every(validMovement) &&
    Array.isArray(data.workdays) && data.workdays.every((day) => !!day && typeof day.id === 'string' &&
      typeof day.startedAt === 'string' && !Number.isNaN(Date.parse(day.startedAt))) &&
    Array.isArray(data.savings) && data.savings.every(validSaving) && validSettings && validTransfers;
}

export async function loadData(): Promise<AppData> {
  try {
    const stored = await ledgerDatabase.transaction('r', ledgerDatabase.movements, ledgerDatabase.workdays, ledgerDatabase.savings, ledgerDatabase.metadata, async () => {
      const [movements, workdays, savings, settingsRecord, initialized] = await Promise.all([
        ledgerDatabase.movements.toArray(),
        ledgerDatabase.workdays.toArray(),
        ledgerDatabase.savings.toArray(),
        ledgerDatabase.metadata.get('settings'),
        ledgerDatabase.metadata.get('initialized'),
      ]);
      const settings = settingsRecord?.value as AppData['settings'] | undefined;
      return {
        data: { schemaVersion: 1 as const, movements, workdays, savings, settings: settings ?? structuredClone(defaultSettings) },
        initialized: initialized?.value === true,
        hasRecords: movements.length > 0 || workdays.length > 0 || savings.length > 0 || Boolean(settings),
      };
    });
    if (stored.initialized) return stored.data;
    if (stored.hasRecords) {
      await saveData(stored.data);
      return stored.data;
    }

    const legacy = window.localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      let parsed: unknown;
      try { parsed = JSON.parse(legacy); } catch { throw new StorageError('Los datos heredados tienen formato inválido y no se sobrescribieron.'); }
      if (!isAppData(parsed)) throw new StorageError('Los datos heredados tienen formato inválido y no se sobrescribieron.');
      await saveData(parsed);
      return parsed;
    }

    const empty = createEmptyData();
    await saveData(empty);
    return empty;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('No se pudo abrir IndexedDB. Comprueba que el navegador permita almacenamiento local.');
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await ledgerDatabase.transaction('rw', ledgerDatabase.movements, ledgerDatabase.workdays, ledgerDatabase.savings, ledgerDatabase.metadata, async () => {
      await Promise.all([
        ledgerDatabase.movements.clear(),
        ledgerDatabase.workdays.clear(),
        ledgerDatabase.savings.clear(),
      ]);
      await Promise.all([
        data.movements.length ? ledgerDatabase.movements.bulkPut(data.movements) : Promise.resolve(),
        data.workdays.length ? ledgerDatabase.workdays.bulkPut(data.workdays) : Promise.resolve(),
        data.savings.length ? ledgerDatabase.savings.bulkPut(data.savings) : Promise.resolve(),
        ledgerDatabase.metadata.put({ key: 'settings', value: data.settings }),
        ledgerDatabase.metadata.put({ key: 'initialized', value: true }),
      ]);
    });
  } catch {
    throw new StorageError('No se pudieron guardar los cambios en IndexedDB. Revisa el espacio disponible.');
  }
}

export function downloadBackup(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cuentas-ruta-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readBackup(file: File): Promise<AppData> {
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new StorageError('El archivo de respaldo no contiene JSON válido.'); }
  if (!isAppData(parsed)) throw new StorageError('El archivo no es un respaldo compatible.');
  return parsed;
}
