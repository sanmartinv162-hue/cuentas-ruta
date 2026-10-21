import { useEffect, useMemo, useState } from 'react';
import type { LedgerSpace, Movement, MovementKind, ThemeMode } from './types';
import { MovementDialog } from './components/MovementDialog';
import { WorkdayClosingDialog } from './components/WorkdayClosingDialog';
import { useLedger } from './hooks/useLedger';
import { AppProviders } from './app/AppProviders';
import { AppRoutes } from './routes';
import { Toast } from './components/ui/Toast';
import { dispatchDueNotifications } from './services/notification.service';

export default function App() {
  const { data, loading, error, actions } = useLedger();
  const [editor, setEditor] = useState<{ space: LedgerSpace; kind: MovementKind; existing?: Movement } | null>(null);
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const activeWorkday = data.workdays.find((workday) => workday.endedAt === null);

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
  }, [data.settings.theme]);

  useEffect(() => {
    if (!loading) dispatchDueNotifications(data);
  }, [data, loading]);

  async function closeWorkday(amountCOP: number, note: string, accountId?: string) {
    const result = await actions.closeWorkday(amountCOP, note, accountId);
    if (!result) setToast('Cierre guardado y ahorro actualizado.');
    return result;
  }

  async function saveMovement(draft: Parameters<typeof actions.addMovement>[0]) {
    if (!editor) return 'No se encontró el formulario activo.';
    return editor.existing
      ? actions.updateMovement(editor.existing.id, draft)
      : actions.addMovement(draft);
  }

  function setThemeMode(nextTheme: ThemeMode) {
    document.documentElement.dataset.theme = nextTheme;
  }

  const runtime = useMemo(() => ({
    data,
    loading,
    error,
    actions,
    notify: setToast,
    openMovement: (space: LedgerSpace, kind: MovementKind) => setEditor({ space, kind }),
    editMovement: (movement: Movement) => setEditor({ space: movement.space, kind: movement.kind, existing: movement }),
    startJourney: actions.startWorkday,
    requestCloseJourney: () => setClosing(true),
    setThemeMode,
  }), [actions, data, error, loading]);

  return (
    <AppProviders value={runtime}>
      <AppRoutes />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {editor && <MovementDialog space={editor.space} kind={editor.kind} existing={editor.existing} settings={data.settings} accounts={data.accountBalances?.[editor.space].accounts ?? []} onSave={saveMovement} onClose={() => setEditor(null)} />}
      {closing && activeWorkday && <WorkdayClosingDialog workday={activeWorkday} accounts={data.accountBalances?.deliveries.accounts ?? []} workdays={data.workdays} movements={data.movements} goalCOP={data.settings.dailyGoalCOP} onCloseDay={closeWorkday} onDismiss={() => setClosing(false)} />}
    </AppProviders>
  );
}
