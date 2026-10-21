import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { LedgerSpace, Movement, MovementKind } from '../types';
import { formatCOP } from '../utils/format';

interface Props {
  movements: Movement[];
  initialSpace?: 'all' | LedgerSpace;
  onEdit(movement: Movement): void;
  onDelete(id: string, space: LedgerSpace): Promise<string | null>;
  onRestore(id: string, space: LedgerSpace): Promise<string | null>;
}

export function HistoryPage({ movements, initialSpace = 'all', onEdit, onDelete, onRestore }: Props) {
  const [query, setQuery] = useState('');
  const [spaceFilter, setSpaceFilter] = useState<'all' | LedgerSpace>(initialSpace);
  const [kindFilter, setKindFilter] = useState<'all' | MovementKind>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deleted'>('active');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const accountOptions = useMemo(() => {
    const byId = new Map<string, { name: string; space: LedgerSpace }>();
    movements.filter((movement) => movement.accountId && (spaceFilter === 'all' || movement.space === spaceFilter))
      .forEach((movement) => byId.set(movement.accountId!, { name: movement.paymentMethod, space: movement.space }));
    return [...byId.entries()].sort(([, left], [, right]) => left.name.localeCompare(right.name, 'es-CO'));
  }, [movements, spaceFilter]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es-CO');
    return [...movements]
      .filter((movement) => spaceFilter === 'all' || movement.space === spaceFilter)
      .filter((movement) => kindFilter === 'all' || movement.kind === kindFilter)
      .filter((movement) => statusFilter === 'all' || (statusFilter === 'deleted' ? Boolean(movement.deletedAt) : !movement.deletedAt))
      .filter((movement) => !startDate || movement.occurredAt.slice(0, 10) >= startDate)
      .filter((movement) => !endDate || movement.occurredAt.slice(0, 10) <= endDate)
      .filter((movement) => !categoryFilter || movement.category.toLocaleLowerCase('es-CO').includes(categoryFilter.toLocaleLowerCase('es-CO')))
      .filter((movement) => accountFilter === 'all' || movement.accountId === accountFilter)
      .filter((movement) => !amountMin || movement.amountCOP >= Number(amountMin))
      .filter((movement) => !amountMax || movement.amountCOP <= Number(amountMax))
      .filter((movement) => {
        if (!normalized) return true;
        const date = new Date(movement.occurredAt);
        const haystack = [movement.description, movement.paymentMethod, movement.category, movement.kind, movement.space, String(movement.amountCOP), formatCOP(movement.amountCOP), date.toLocaleDateString('es-CO'), date.toISOString().slice(0, 10)].join(' ').toLocaleLowerCase('es-CO');
        return haystack.includes(normalized);
      })
        .sort((a, b) => sortOrder === 'newest' ? b.occurredAt.localeCompare(a.occurredAt) : a.occurredAt.localeCompare(b.occurredAt));
      }, [accountFilter, amountMax, amountMin, categoryFilter, endDate, kindFilter, movements, query, sortOrder, spaceFilter, startDate, statusFilter]);

  async function remove(movement: Movement) {
    if (!window.confirm(`¿Eliminar “${movement.description}” por ${formatCOP(movement.amountCOP)}?`)) return;
    setBusyId(movement.id);
    const result = await onDelete(movement.id, movement.space);
    setBusyId(null);
    setError(result);
  }

  async function restore(movement: Movement) {
    setBusyId(movement.id);
    const result = await onRestore(movement.id, movement.space);
    setBusyId(null);
    setError(result);
  }

  return (
    <div className="page-content">
      <div className="page-heading"><div><p className="eyebrow">REGISTRO</p><h1>Movimientos</h1></div><span className="result-count">{results.length} {results.length === 1 ? 'resultado' : 'resultados'}</span></div>
      <div className="filter-bar">
        <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Descripción, fecha, monto o método" aria-label="Buscar movimientos" /><kbd>/</kbd></label>
        <select value={spaceFilter} onChange={(event) => { setSpaceFilter(event.target.value as 'all' | LedgerSpace); setAccountFilter('all'); }} aria-label="Filtrar por módulo"><option value="all">Todos los espacios</option><option value="personal">Finanzas personales</option><option value="deliveries">Domicilios</option></select>
        <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as 'all' | MovementKind)} aria-label="Filtrar por tipo"><option value="all">Todos los tipos</option><option value="income">Ingresos</option><option value="expense">Gastos</option></select>
        <label className="filter-field"><span>Desde</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Fecha inicial" /></label>
        <label className="filter-field"><span>Hasta</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Fecha final" /></label>
        <input className="filter-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} placeholder="Categoría" aria-label="Filtrar por categoría" />
        <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} aria-label="Filtrar por cuenta"><option value="all">Todas las cuentas</option>{accountOptions.map(([id, account]) => <option key={id} value={id}>{account.name}{spaceFilter === 'all' ? ` · ${account.space === 'personal' ? 'Finanzas personales' : 'Domicilios'}` : ''}</option>)}</select>
        <input className="filter-input" type="number" min="0" value={amountMin} onChange={(event) => setAmountMin(event.target.value)} placeholder="Valor mínimo" aria-label="Valor mínimo" />
        <input className="filter-input" type="number" min="0" value={amountMax} onChange={(event) => setAmountMax(event.target.value)} placeholder="Valor máximo" aria-label="Valor máximo" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'deleted')} aria-label="Filtrar por estado"><option value="active">Activos</option><option value="deleted">Eliminados</option><option value="all">Todos los estados</option></select>
        <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')} aria-label="Ordenar historial"><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option></select>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {results.length ? <div className="movement-table">
        {results.map((movement) => <article className={`movement-row ${movement.deletedAt ? 'movement-deleted' : ''}`} key={movement.id}>
          <span className={`movement-symbol ${movement.kind}`} aria-hidden="true">{movement.kind === 'income' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
          <div className="recent-description"><strong>{movement.description}</strong><span>{movement.space === 'personal' ? 'Finanzas personales' : 'Domicilios'} · {movement.category || (movement.kind === 'income' ? 'Ingreso' : 'Gasto')} · {movement.paymentMethod}</span></div>
          <div className="movement-date">{new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(movement.occurredAt))}</div>
          <strong className={`movement-amount ${movement.kind === 'income' ? 'positive' : ''}`}>{movement.kind === 'income' ? '+' : '−'}{formatCOP(movement.amountCOP)}</strong>
          <div className="row-actions">{movement.deletedAt ? <button className="icon-button" onClick={() => void restore(movement)} disabled={busyId === movement.id} aria-label={`Restaurar ${movement.description}`}><RotateCcw size={16} /></button> : <><button className="icon-button" onClick={() => onEdit(movement)} aria-label={`Editar ${movement.description}`}><Pencil size={15} /></button><button className="icon-button delete-action" onClick={() => void remove(movement)} disabled={busyId === movement.id} aria-label={`Eliminar ${movement.description}`}><Trash2 size={15} /></button></>}</div>
        </article>)}
      </div> : <div className="empty-state"><span className="panel-icon"><Search size={18} /></span><div><strong>{movements.length ? 'Sin resultados' : 'Aún no hay movimientos'}</strong><p>{movements.length ? 'Cambia el texto o los filtros e inténtalo de nuevo.' : 'Los movimientos nuevos aparecerán aquí.'}</p></div></div>}
    </div>
  );
}

