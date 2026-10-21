import { useCallback, useEffect, useMemo, useState } from 'react';
import { createEmptyData } from '../models/defaults';
import { financeApplicationService } from '../services/application.service';
import { savingsBalance } from '../services/ledger';
import type { AppData, AppSettings, LedgerSpace, MovementDraft } from '../types';
import type { FinancialModule } from '../types/database';

export interface LedgerActions {
  addMovement(draft: MovementDraft): Promise<string | null>;
  updateMovement(id: string, draft: MovementDraft): Promise<string | null>;
  deleteMovement(id: string, space: LedgerSpace): Promise<string | null>;
  restoreMovement(id: string, space: LedgerSpace): Promise<string | null>;
  startWorkday(initialCapitalCOP: number): Promise<string | null>;
  closeWorkday(transferCOP: number, note: string, accountId?: string): Promise<string | null>;
  addSavingsDeposit(amountCOP: number, note: string, accountId?: string): Promise<string | null>;
  addSavingsWithdrawal(amountCOP: number, note: string, accountId?: string): Promise<string | null>;
  deleteSaving(id: string): Promise<string | null>;
  restoreSaving(id: string): Promise<string | null>;
  transferFunds(input: { module: FinancialModule; sourceAccountId: string; destinationAccountId: string; amount: number; description: string; date: string }): Promise<string | null>;
  deleteTransfer(id: string): Promise<string | null>;
  restoreTransfer(id: string): Promise<string | null>;
  createAccount(module: FinancialModule, name: string): Promise<string | null>;
  updateSettings(settings: AppSettings): Promise<string | null>;
  importData(data: AppData): Promise<string | null>;
  clearTodayRecords(): Promise<string | null>;
}

export function useLedger(): { data: AppData; loading: boolean; error: string | null; actions: LedgerActions } {
  const [data, setData] = useState<AppData>(createEmptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void financeApplicationService.load().then((loaded) => {
      if (mounted) setData(loaded);
    }).catch((cause: unknown) => {
      if (mounted) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los datos.');
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const execute = useCallback(async (operation: () => Promise<string | null>): Promise<string | null> => {
    try {
      const problem = await operation();
      if (problem) return problem;
      setData(await financeApplicationService.snapshot());
      setError(null);
      return null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Error al guardar.';
      setError(message);
      return message;
    }
  }, []);

  const actions = useMemo<LedgerActions>(() => ({
    addMovement: (draft) => execute(() => financeApplicationService.createMovement(draft)),
    updateMovement: (id, draft) => execute(() => financeApplicationService.updateMovement(id, draft)),
    deleteMovement: (id, space) => execute(() => financeApplicationService.deleteMovement(id, space)),
    restoreMovement: (id, space) => execute(() => financeApplicationService.restoreMovement(id, space)),
    startWorkday: (initialCapitalCOP) => execute(() => financeApplicationService.startJourney(initialCapitalCOP)),
    closeWorkday: (transferCOP, note, accountId) => execute(() => financeApplicationService.closeJourney(transferCOP, note, accountId)),
    addSavingsDeposit: (amountCOP, note, accountId) => execute(() => financeApplicationService.savingDeposit(amountCOP, note, accountId)),
    addSavingsWithdrawal: (amountCOP, note, accountId) => execute(() => financeApplicationService.savingWithdrawal(amountCOP, note, accountId)),
    deleteSaving: (id) => execute(() => financeApplicationService.deleteSaving(id)),
    restoreSaving: (id) => execute(() => financeApplicationService.restoreSaving(id)),
    transferFunds: (input) => execute(() => financeApplicationService.createTransfer(input)),
    deleteTransfer: (id) => execute(() => financeApplicationService.deleteTransfer(id)),
    restoreTransfer: (id) => execute(() => financeApplicationService.restoreTransfer(id)),
    createAccount: (module, name) => execute(() => financeApplicationService.createAccount(module, name)),
    updateSettings: (settings) => execute(() => financeApplicationService.updateSettings(settings)),
    importData: (data) => execute(() => financeApplicationService.restoreBackup(data)),
    clearTodayRecords: () => execute(() => financeApplicationService.clearTodayRecords()),
  }), [execute]);

  return { data, loading, error, actions };
}

export function getSavingsBalance(data: AppData): number {
  return savingsBalance(data.savings);
}
