import { ArrowRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppData, Movement } from '../types';
import { searchLedger } from '../services/ledger';
import { dateLabel, formatCOP } from '../utils/format';

interface Props {
  data: AppData;
  onEdit(movement: Movement): void;
  onNavigate(path: string): void;
}

const labels = { movement: 'Movimiento', journey: 'Jornada', transfer: 'Transferencia', saving: 'Ahorro', report: 'Reporte' };

export function GlobalSearch({ data, onEdit, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchLedger(data, query), [data, query]);
  return <section className="global-search-panel" aria-label="Búsqueda global">
    <div className="section-heading"><div><p className="eyebrow">BÚSQUEDA GLOBAL</p><h2>Encuentra en tus registros</h2></div></div>
    <label className="global-search-input"><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Descripción, fecha, valor, cuenta o categoría" aria-label="Buscar en movimientos, jornadas, transferencias, ahorros y reportes" /></label>
    {query.trim() && <div className="global-search-results" aria-live="polite">
      {results.length ? results.map((result) => <button className="global-search-result" type="button" key={`${result.type}-${result.id}`} onClick={() => result.movement ? onEdit(result.movement) : result.destination && onNavigate(result.destination)}>
        <span className="global-search-type">{labels[result.type]}</span><span className="global-search-result-main"><strong>{result.title}</strong><small>{result.detail} · {dateLabel(result.date, { dateStyle: 'medium' })}</small></span>
        {result.amountCOP !== undefined && <strong className="global-search-amount">{formatCOP(result.amountCOP)}</strong>}<ArrowRight size={15} aria-hidden="true" />
      </button>) : <p className="section-footnote">No se encontraron registros para “{query}”.</p>}
      {results.length === 20 && <p className="section-footnote">Se muestran los 20 resultados más recientes.</p>}
    </div>}
  </section>;
}
