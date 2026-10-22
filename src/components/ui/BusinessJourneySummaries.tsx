import { ChevronDown, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import type { Movement, Workday } from '../../types';
import { formatCOP } from '../../utils/format';
import { totalsFor } from '../../services/ledger';

interface Account { id: string; name: string; balance: number }

export function BusinessJourneySummaries({ workdays, movements, accounts }: { workdays: Workday[]; movements: Movement[]; accounts: Account[] }) {
  const today = new Date().toDateString();
  const journeys = workdays.filter((journey) => !journey.deletedAt && new Date(journey.startedAt).toDateString() === today).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const [openId, setOpenId] = useState<string | null>(journeys[0]?.id ?? null);
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name ?? 'Cuenta';
  if (!journeys.length) return <div className="empty-state"><span className="panel-icon"><ClipboardList size={18} /></span><div><strong>No hay una jornada guardada hoy</strong><p>Cuando registres o cierres la jornada, su resumen aparecerá aquí.</p></div></div>;
  return <div className="business-record-summaries">{journeys.map((journey) => {
    const journeyMovements = movements.filter((movement) => movement.space === 'deliveries' && !movement.deletedAt && movement.workdayId === journey.id);
    const totals = totalsFor(journeyMovements);
    const deliveries = journeyMovements.reduce((sum, movement) => sum + movement.deliveryCount, 0);
    const open = openId === journey.id;
    return <article className="business-record-summary" key={journey.id}><button type="button" className="business-record-summary-header" onClick={() => setOpenId(open ? null : journey.id)} aria-expanded={open}><span><strong>Jornada del {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(journey.startedAt))}</strong><small>{journey.endedAt ? 'Cerrada' : 'Activa'} · {journeyMovements.length} registros · {deliveries} domicilios</small></span><span>{formatCOP(totals.profitCOP)} <ChevronDown size={16} className={open ? 'summary-chevron-open' : ''} /></span></button>{open && <div className="business-record-details"><div><span>Inicio</span><strong>{new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(journey.startedAt))}</strong></div><div><span>Fin</span><strong>{journey.endedAt ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(journey.endedAt)) : 'En curso'}</strong></div><div><span>Capital inicial</span><strong>{formatCOP(journey.initialCapitalCOP)}</strong></div><div><span>Ingresos</span><strong className="positive">{formatCOP(totals.incomeCOP)}</strong></div><div><span>Gastos</span><strong>{formatCOP(totals.expenseCOP)}</strong></div><div><span>Utilidad</span><strong className={totals.profitCOP >= 0 ? 'positive' : ''}>{formatCOP(totals.profitCOP)}</strong></div><div><span>Domicilios</span><strong>{deliveries}</strong></div><div><span>Ahorro trasladado</span><strong>{formatCOP(journey.savingsTransferredCOP)}</strong></div><div><span>Capital final guardado</span><strong>{journey.finalCapitalByAccount ? Object.entries(journey.finalCapitalByAccount).map(([id, amount]) => `${accountName(id)}: ${formatCOP(amount)}`).join(' · ') : 'En curso'}</strong></div><div><span>Registros incluidos</span><strong>{journeyMovements.length}</strong></div></div>}</article>;
  })}</div>;
}
