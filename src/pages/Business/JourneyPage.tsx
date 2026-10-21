import { ArrowLeft, ArrowUpRight, Bike, CircleCheck, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppRuntime, useJourney } from '../../contexts/AppContexts';
import { PrimaryButton, SecondaryButton } from '../../components/buttons/ActionButtons';
import { Card } from '../../components/cards/Card';
import { Section } from '../../components/layout/Section';
import { EmptyState } from '../../components/ui/EmptyState';
import { availableBusinessCapital, totalsFor } from '../../services/ledger';
import { formatCOP } from '../../utils/format';
import { StartJourneyButton } from '../../components/StartJourneyButton';

export default function JourneyPage() {
  const { data, openMovement, notify } = useAppRuntime();
  const journey = useJourney();
  const active = journey.active;
  const entries = active ? data.movements.filter((movement) => !movement.deletedAt && movement.workdayId === active.id) : [];
  const totals = totalsFor(entries, 'deliveries');
  const capital = active ? availableBusinessCapital(active, data.movements) : 0;

  async function start(initialCapitalCOP: number) {
    const result = await journey.start(initialCapitalCOP);
    notify(result ?? 'Jornada iniciada.');
    return result;
  }

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">NEGOCIO DE DOMICILIOS</p><h1>Jornada</h1></div><Link className="icon-link" to="/business" aria-label="Volver al negocio"><ArrowLeft size={18} /></Link></div>
    <Section title="Estado de la jornada" eyebrow="SEGUIMIENTO"><Card className="journey-status-card"><span className={`journey-status-icon ${active ? 'is-active' : ''}`}><Bike size={22} /></span><div className="journey-status-copy"><strong>{active ? 'Jornada en curso' : 'Jornada cerrada'}</strong><span>{active ? `Inicio: ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(active.startedAt))}` : 'Inicia una jornada para comenzar a registrar movimientos.'}</span></div><span className={`shift-badge ${active ? 'shift-active' : ''}`}>{active ? 'Activa' : 'Inactiva'}</span></Card></Section>
    {active && <Section title="Resumen actual" eyebrow="CAPITAL Y MOVIMIENTOS"><div className="stat-grid"><Card className="compact-stat"><span>Capital disponible</span><strong>{formatCOP(capital)}</strong></Card><Card className="compact-stat"><span>Ingresos</span><strong>{formatCOP(totals.incomeCOP)}</strong></Card><Card className="compact-stat"><span>Gastos</span><strong>{formatCOP(totals.expenseCOP)}</strong></Card></div></Section>}
    <Section title="Acciones" eyebrow="JORNADA"><div className="journey-actions">{active ? <><PrimaryButton icon={<Plus size={16} />} onClick={() => openMovement('deliveries', 'income')}>Registrar ingreso</PrimaryButton><SecondaryButton icon={<ArrowUpRight size={16} />} onClick={() => openMovement('deliveries', 'expense')}>Registrar gasto</SecondaryButton><SecondaryButton icon={<CircleCheck size={16} />} onClick={journey.requestClose}>Finalizar jornada</SecondaryButton></> : <StartJourneyButton className="button primary-button" availableCapital={data.accountBalances?.deliveries.total ?? 0} onStart={start} />}</div></Section>
    <Section title="Movimientos de la jornada" eyebrow="ACTIVIDAD">{entries.length ? <div className="journey-history-list">{entries.map((item) => <div className="journey-history-row" key={item.id}><span>{item.description}</span><strong>{formatCOP(item.amountCOP)}</strong></div>)}</div> : <EmptyState icon={<Bike size={18} />} title="Sin movimientos todavía" description={active ? 'Registra el primer movimiento de esta jornada.' : 'Los movimientos aparecerán cuando inicies una jornada.'} />}</Section>
  </div>;
}
