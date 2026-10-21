import { useAppRuntime } from '../../contexts/AppContexts';
import { SavingsPage as SavingsView } from '../SavingsPage';

export default function SavingsPage() {
  const { data, actions } = useAppRuntime();
  return <SavingsView
    movements={data.savings}
    accounts={data.accountBalances?.deliveries.accounts ?? []}
    onWithdraw={actions.addSavingsWithdrawal}
    onDeposit={actions.addSavingsDeposit}
    onDelete={actions.deleteSaving}
    onRestore={actions.restoreSaving}
  />;
}