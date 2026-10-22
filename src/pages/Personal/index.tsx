import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useAppRuntime } from '../../contexts/AppContexts';
import { PrimaryButton, SecondaryButton } from '../../components/buttons/ActionButtons';
import { StatCard } from '../../components/cards/StatCard';
import { Section } from '../../components/layout/Section';
import { HistoryPage } from '../HistoryPage';
import { AccountTransferDialog } from '../../components/dialogs/AccountTransferDialog';
import { TransferHistory } from '../../components/ui/TransferHistory';
import { totalsFor } from '../../services/ledger';
import { formatCOP } from '../../utils/format';

export default function PersonalPage() {
  const { data, openMovement, editMovement, actions } = useAppRuntime();
  const [transferOpen, setTransferOpen] = useState(false);
  const personal = data.movements.filter((movement) => !movement.deletedAt && movement.space === 'personal');
  const month = new Date();
  const monthly = personal.filter((movement) => {
    const date = new Date(movement.occurredAt);
    return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
  });
  const totals = totalsFor(personal);
  const monthlyTotals = totalsFor(monthly);

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">ESPACIO PERSONAL</p><h1>Finanzas personales</h1></div><div className="quick-actions"><SecondaryButton icon={<ArrowRightLeft size={16} />} onClick={() => setTransferOpen(true)}>Transferir</SecondaryButton><PrimaryButton icon={<Plus size={16} />} onClick={() => openMovement('personal', 'expense')}>Registrar movimiento</PrimaryButton></div></div>
    <Section title="Resumen" eyebrow="ESTE MES"><div className="stat-grid"><StatCard label="Capital total" value={formatCOP(data.accountBalances?.personal.total ?? totals.profitCOP)} icon={<Wallet size={18} />} />{data.accountBalances?.personal.accounts.map((account) => <StatCard key={account.id} label={`Capital en ${account.name}`} value={formatCOP(account.balance)} icon={<Wallet size={18} />} />)}<StatCard label="Ingresos del mes" value={formatCOP(monthlyTotals.incomeCOP)} icon={<ArrowDownLeft size={18} />} /><StatCard label="Gastos del mes" value={formatCOP(monthlyTotals.expenseCOP)} icon={<ArrowUpRight size={18} />} /><StatCard label="Balance del mes" value={formatCOP(monthlyTotals.profitCOP)} icon={<ArrowUpRight size={18} />} /></div></Section>
    <Section title="Registrar movimiento" eyebrow="ACCESO RÁPIDO"><div className="quick-action-panel"><p>Agrega un ingreso o gasto personal.</p><div className="quick-actions"><PrimaryButton icon={<ArrowDownLeft size={16} />} onClick={() => openMovement('personal', 'income')}>Registrar ingreso</PrimaryButton><SecondaryButton icon={<ArrowUpRight size={16} />} onClick={() => openMovement('personal', 'expense')}>Registrar gasto</SecondaryButton></div></div></Section>
    <Section title="Historial" eyebrow="MOVIMIENTOS"><HistoryPage movements={data.movements} initialSpace="personal" onEdit={editMovement} onDelete={actions.deleteMovement} onRestore={actions.restoreMovement} /></Section>
    <Section title="Transferencias entre cuentas" eyebrow="ORIGEN Y DESTINO"><TransferHistory records={data.transfers?.personal ?? []} accounts={[...(data.accountBalances?.personal.accounts ?? []).map((account) => ({ ...account, module: 'personal' as const })), ...(data.accountBalances?.deliveries.accounts ?? []).map((account) => ({ ...account, module: 'business' as const }))]} onDelete={actions.deleteTransfer} onRestore={actions.restoreTransfer} /></Section>
    {transferOpen && <AccountTransferDialog module="personal" accounts={[...(data.accountBalances?.personal.accounts ?? []).map((account) => ({ ...account, module: 'personal' as const })), ...(data.accountBalances?.deliveries.accounts ?? []).map((account) => ({ ...account, module: 'business' as const }))]} onSave={actions.transferFunds} onClose={() => setTransferOpen(false)} />}
  </div>;
}
