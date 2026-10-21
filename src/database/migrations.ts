import type { Transaction } from 'dexie';
import type { BusinessMovementRecord, FinancialAccountRecord, JourneyRecord, PersonalMovementRecord, SettingsRecord } from '../types/database';
import { normalizeFinancialAccountName } from '../models/financialAccount';

/** Completa campos de sincronización al actualizar movimientos existentes v1. */
export async function migrateV1ToV2(transaction: Transaction): Promise<void> {
  const personal = transaction.table<PersonalMovementRecord, string>('personalMovements');
  const business = transaction.table<BusinessMovementRecord, string>('businessMovements');

  await Promise.all([
    personal.toCollection().modify((record) => {
      record.version ??= 1;
      record.synced ??= false;
      record.syncVersion ??= 1;
      record.deviceId ||= 'migration-v1';
      record.deletedAt ??= null;
    }),
    business.toCollection().modify((record) => {
      record.version ??= 1;
      record.synced ??= false;
      record.syncVersion ??= 1;
      record.deviceId ||= 'migration-v1';
      record.deletedAt ??= null;
    }),
  ]);
}

type LegacyAccountRecord = Omit<FinancialAccountRecord, 'normalizedName'> & { normalizedName?: string };

function mergeAccountValues(values: Record<string, number> | undefined, aliases: Map<string, string>): Record<string, number> | undefined {
  if (!values) return undefined;
  const merged: Record<string, number> = {};
  for (const [accountId, amount] of Object.entries(values)) {
    const canonicalId = aliases.get(accountId) ?? accountId;
    merged[canonicalId] = (merged[canonicalId] ?? 0) + amount;
  }
  return merged;
}

/** Consolida cuentas equivalentes y todas sus referencias antes de activar el índice único. */
export async function migrateV3ToV4(transaction: Transaction): Promise<void> {
  const accounts = transaction.table<LegacyAccountRecord, string>('accounts');
  const rows = await accounts.toArray();
  const groups = new Map<string, LegacyAccountRecord[]>();
  for (const account of rows) {
    const normalizedName = normalizeFinancialAccountName(account.name);
    const key = `${account.module}\u0000${normalizedName}`;
    groups.set(key, [...(groups.get(key) ?? []), account]);
  }

  const aliases = new Map<string, string>();
  const canonicalRows: LegacyAccountRecord[] = [];
  const duplicateIds: string[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => Number(Boolean(left.deletedAt)) - Number(Boolean(right.deletedAt)) ||
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const [canonical, ...duplicates] = ordered;
    canonicalRows.push({ ...canonical, name: canonical.name.trim().replace(/\s+/g, ' '), normalizedName: normalizeFinancialAccountName(canonical.name) });
    for (const duplicate of duplicates) {
      aliases.set(duplicate.id, canonical.id);
      duplicateIds.push(duplicate.id);
    }
  }

  const personal = transaction.table<PersonalMovementRecord, string>('personalMovements');
  const business = transaction.table<BusinessMovementRecord, string>('businessMovements');
  const savings = transaction.table('savings');
  const transfers = transaction.table('transfers');
  const journeys = transaction.table<JourneyRecord, string>('journeys');
  const settings = transaction.table<SettingsRecord, string>('settings');
  await Promise.all([
    personal.toCollection().modify((record) => { if (record.accountId) record.accountId = aliases.get(record.accountId) ?? record.accountId; }),
    business.toCollection().modify((record) => { if (record.accountId) record.accountId = aliases.get(record.accountId) ?? record.accountId; }),
    savings.toCollection().modify((record: { accountId?: string }) => { if (record.accountId) record.accountId = aliases.get(record.accountId) ?? record.accountId; }),
    transfers.toCollection().modify((record: { sourceAccountId: string; destinationAccountId: string }) => {
      record.sourceAccountId = aliases.get(record.sourceAccountId) ?? record.sourceAccountId;
      record.destinationAccountId = aliases.get(record.destinationAccountId) ?? record.destinationAccountId;
    }),
    journeys.toCollection().modify((record) => {
      record.initialCapitalByAccount = mergeAccountValues(record.initialCapitalByAccount, aliases);
      record.finalCapitalByAccount = mergeAccountValues(record.finalCapitalByAccount, aliases);
      record.incomeByAccount = mergeAccountValues(record.incomeByAccount, aliases);
      record.expensesByAccount = mergeAccountValues(record.expensesByAccount, aliases);
    }),
    settings.toCollection().modify((record) => {
      record.businessInitialCapitalByAccount = mergeAccountValues(record.businessInitialCapitalByAccount, aliases);
      record.personalInitialCapitalByAccount = mergeAccountValues(record.personalInitialCapitalByAccount, aliases);
    }),
  ]);

  if (duplicateIds.length) await accounts.bulkDelete(duplicateIds);
  for (const account of canonicalRows) await accounts.put(account as FinancialAccountRecord);
}
