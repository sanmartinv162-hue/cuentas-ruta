import { useAppRuntime } from '../../contexts/AppContexts';
import { SettingsPage as SettingsView } from '../SettingsPage';

export default function SettingsPage() {
  const { data, actions, setThemeMode } = useAppRuntime();
  const accounts = [
    ...(data.accountBalances?.personal.accounts ?? []).map((account) => ({ ...account, module: 'personal' as const })),
    ...(data.accountBalances?.deliveries.accounts ?? []).map((account) => ({ ...account, module: 'business' as const })),
  ];
  return <SettingsView data={data} onSave={actions.updateSettings} onImport={actions.importData} onTheme={setThemeMode} accounts={accounts} onCreateAccount={actions.createAccount} onClearToday={actions.clearTodayRecords} />;
}
