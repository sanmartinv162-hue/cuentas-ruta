import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Bike, Clock3, PiggyBank, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAppRuntime } from '../../contexts/AppContexts';
import { StartJourneyButton } from '../../components/StartJourneyButton';
import { SecondaryButton } from '../../components/buttons/ActionButtons';
import { StatCard } from '../../components/cards/StatCard';
import { Section } from '../../components/layout/Section';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { HistoryPage } from '../HistoryPage';
import { AccountTransferDialog } from '../../components/dialogs/AccountTransferDialog';
import { TransferHistory } from '../../components/ui/TransferHistory';
import { availableBusinessCapital, goalProgress, savingsBalance, totalsFor } from '../../services/ledger';
import { formatCOP } from '../../utils/format';
import { BusinessJourneySummaries } from '../../components/ui/BusinessJourneySummaries';

export default function BusinessPage() {
  const { data, openMovement, notify, editMovement, actions, startJourney, loading } = useAppRuntime();
  const [transferOpen, setTransferOpen] = useState(false);
  const today = new Date().toDateString();
  const todayMovements = data.movements.filter((movement) => !movement.deletedAt && movement.space === 'deliveries' && new Date(movement.occurredAt).toDateString() === today);
  const todayTotals = totalsFor(todayMovements);
  const activeJourney = data.workdays.find((workday) => workday.endedAt === null);
  const lastJourney = activeJourney ?? [...data.workdays].reverse().find((workday) => !workday.deletedAt);
  const capital = lastJourney ? availableBusinessCapital(lastJourney, data.movements) : data.settings.startingCapitalCOP;
  const savings = savingsBalance(data.savings);

  async function start(initialCapitalCOP: number) {
    const error = await startJourney(initialCapitalCOP);
    notify(error ?? 'Jornada iniciada.');
    return error;
  }

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">ESPACIO 02</p><h1>Negocio de domicilios</h1></div><div className="business-page-heading-actions">{activeJourney ? <Link className="shift-badge shift-active" to="/business/journey">Jornada activa</Link> : <><span className="shift-badge">Jornada cerrada</span><StartJourneyButton className="button outline-button" availableCapital={data.accountBalances?.deliveries.total ?? 0} onStart={start} disabled={loading} /></>}</div></div>
    <Section title="Capital" eyebrow="RESUMEN"><div className="stat-grid"><StatCard label="Capital total" value={formatCOP(data.accountBalances?.deliveries.total ?? capital)} icon={<Bike size={18} />} />{data.accountBalances?.deliveries.accounts.map((account) => <StatCard key={account.id} label={`Capital en ${account.name}`} value={formatCOP(account.balance)} icon={<Bike size={18} />} />)}<StatCard label="Ahorro" value={formatCOP(savings)} icon={<PiggyBank size={18} />} /><StatCard label="Utilidad acumulada" value={formatCOP(data.businessProfitCOP ?? 0)} icon={<Clock3 size={18} />} /><StatCard label="Meta diaria" value={formatCOP(data.dailyGoal?.goal ?? data.settings.dailyGoalCOP)} icon={<Target size={18} />} /></div></Section>
    <Section title="Meta diaria" eyebrow="OBJETIVO"><div className="goal-card"><div><strong>{formatCOP(todayTotals.incomeCOP)}</strong><span> de {formatCOP(data.settings.dailyGoalCOP)}</span></div><ProgressBar value={goalProgress(todayTotals.incomeCOP, data.settings.dailyGoalCOP)} label="Avance de ingresos" /></div></Section>
    <Section title="Jornada" eyebrow="ESTADO ACTUAL" action={<Link className="text-action" to="/business/journey">Ver jornada</Link>}><div className="quick-action-panel"><p>{activeJourney ? `Iniciada ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activeJourney.startedAt))}` : 'No hay una jornada en curso.'}</p></div></Section>
    <Section title="Movimientos" eyebrow="REGISTRO DE HOY"><div className="business-actions"><SecondaryButton icon={<ArrowDownLeft size={16} />} onClick={() => openMovement('deliveries', 'income')}>Registrar ingreso</SecondaryButton><SecondaryButton icon={<ArrowUpRight size={16} />} onClick={() => openMovement('deliveries', 'expense')}>Registrar gasto</SecondaryButton><SecondaryButton icon={<ArrowRightLeft size={16} />} onClick={() => setTransferOpen(true)}>Transferir entre cuentas</SecondaryButton></div><p className="section-footnote">{todayMovements.length} movimientos registrados hoy.</p></Section>
    <Section title="Historial de movimientos" eyebrow="BUSCAR Y FILTRAR"><HistoryPage movements={data.movements} initialSpace="deliveries" onEdit={editMovement} onDelete={actions.deleteMovement} onRestore={actions.restoreMovement} /></Section>
    <Section title="Resumen de jornadas del día" eyebrow="JORNADAS GUARDADAS"><BusinessJourneySummaries workdays={data.workdays} movements={data.movements} accounts={data.accountBalances?.deliveries.accounts ?? []} /></Section>
    <Section title="Transferencias entre cuentas" eyebrow="ORIGEN Y DESTINO"><TransferHistory records={data.transfers?.deliveries ?? []} accounts={[...(data.accountBalances?.personal.accounts ?? []).map((account) => ({ ...account, module: 'personal' as const })), ...(data.accountBalances?.deliveries.accounts ?? []).map((account) => ({ ...account, module: 'business' as const }))]} onDelete={actions.deleteTransfer} onRestore={actions.restoreTransfer} /></Section>
    <Section title="Ahorro" eyebrow="BOLSILLO SEPARADO" action={<Link className="text-action" to="/business/savings">Ver ahorro</Link>}><div className="quick-action-panel"><div><p>Saldo acumulado</p><strong className="business-balance">{formatCOP(savings)}</strong></div><Link className="button outline-button" to="/business/savings">Abrir historial</Link></div></Section>
    <Section title="Historial" eyebrow="JORNADAS"><div className="journey-history-list">{data.workdays.some((workday) => !workday.deletedAt) ? [...data.workdays].filter((workday) => !workday.deletedAt).reverse().slice(0, 4).map((journey) => <div className="journey-history-row" key={journey.id}><span>{new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(journey.startedAt))}</span><strong>{journey.endedAt ? 'Finalizada' : 'En curso'}</strong></div>) : <p className="section-footnote">Aún no hay jornadas registradas.</p>}</div></Section>
    {transferOpen && <AccountTransferDialog module="business" accounts={[...(data.accountBalances?.personal.accounts ?? []).map((account) => ({ ...account, module: 'personal' as const })), ...(data.accountBalances?.deliveries.accounts ?? []).map((account) => ({ ...account, module: 'business' as const }))]} onSave={actions.transferFunds} onClose={() => setTransferOpen(false)} />}
  </div>;
}
