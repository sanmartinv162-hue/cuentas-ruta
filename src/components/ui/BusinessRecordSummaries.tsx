import { ChevronDown, FileText } from 'lucide-react';
import { useState } from 'react';
import type { Movement } from '../../types';
import { formatCOP } from '../../utils/format';

export function BusinessRecordSummaries({ movements }: { movements: Movement[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const records = [...movements].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  if (!records.length) return <div className="empty-state"><span className="panel-icon"><FileText size={18} /></span><div><strong>Aún no hay registros guardados</strong><p>Los ingresos y gastos del negocio aparecerán aquí.</p></div></div>;
  return <div className="business-record-summaries">{records.map((movement) => { const open = openId === movement.id; return <article className={`business-record-summary ${movement.deletedAt ? 'movement-deleted' : ''}`} key={movement.id}>
    <button type="button" className="business-record-summary-header" onClick={() => setOpenId(open ? null : movement.id)} aria-expanded={open}><span><strong>{movement.description || 'Sin descripción'}</strong><small>{movement.kind === 'income' ? 'Ingreso' : 'Gasto'} · {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(movement.occurredAt))}</small></span><span className={movement.kind === 'income' ? 'positive' : ''}>{movement.kind === 'income' ? '+' : '−'}{formatCOP(movement.amountCOP)} <ChevronDown size={16} className={open ? 'summary-chevron-open' : ''} /></span></button>
    {open && <div className="business-record-details"><div><span>ID</span><strong>{movement.id}</strong></div><div><span>Tipo</span><strong>{movement.kind === 'income' ? 'Ingreso' : 'Gasto'}</strong></div><div><span>Fecha y hora</span><strong>{new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(movement.occurredAt))}</strong></div><div><span>Valor</span><strong>{formatCOP(movement.amountCOP)}</strong></div><div><span>Descripción</span><strong>{movement.description || 'Sin descripción'}</strong></div><div><span>Método / cuenta</span><strong>{movement.paymentMethod || 'No especificado'}</strong></div><div><span>Categoría</span><strong>{movement.category || 'Sin categoría'}</strong></div><div><span>Domicilios</span><strong>{movement.deliveryCount}</strong></div><div><span>Jornada</span><strong>{movement.workdayId || 'Sin jornada'}</strong></div><div><span>Estado</span><strong>{movement.deletedAt ? 'Eliminado' : 'Activo'}</strong></div></div>}
  </article>; })}</div>;
}
