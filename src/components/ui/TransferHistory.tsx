import { ArrowRightLeft, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { AccountTransfer } from '../../types';

export function TransferHistory({ records, accounts, onDelete, onRestore }: {
  records: AccountTransfer[];
  accounts: { id: string; name: string; module?: 'personal' | 'business' }[];
  onDelete(id: string): Promise<string | null>;
  onRestore(id: string): Promise<string | null>;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entries = records.filter((record) => showDeleted || !record.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  const accountLabel = (id: string, module?: 'personal' | 'business') => {
    const account = accounts.find((item) => item.id === id);
    const resolvedModule = module ?? account?.module;
    const moduleLabel = resolvedModule === 'personal' ? 'Personal' : resolvedModule === 'business' ? 'Negocio' : '';
    return `${moduleLabel}${moduleLabel ? ' · ' : ''}${account?.name ?? 'Cuenta'}`;
  };

  async function update(record: AccountTransfer, action: 'delete' | 'restore') {
    const result = action === 'delete' ? await onDelete(record.id) : await onRestore(record.id);
    setError(result);
  }

  return <div className="transfer-history"><label className="deleted-toggle"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Mostrar eliminadas</label>{error && <p className="form-error" role="alert">{error}</p>}{entries.length ? <div className="movement-table">{entries.map((record) => { const sourceModule = record.sourceModule ?? record.module; const destinationModule = record.destinationModule ?? record.module; return <article className={`movement-row ${record.deletedAt ? 'movement-deleted' : ''}`} key={record.id}><span className="movement-symbol"><ArrowRightLeft size={16} /></span><div className="recent-description"><strong>{accountLabel(record.sourceAccountId, sourceModule)} → {accountLabel(record.destinationAccountId, destinationModule)}</strong><span>{record.description || 'Transferencia entre cuentas'} · Registrada desde {record.module === 'personal' ? 'Personal' : 'Negocio'} · {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.date))}</span></div><strong>{record.amount.toLocaleString('es-CO')} COP</strong><div className="row-actions">{record.deletedAt ? <button className="icon-button" aria-label="Restaurar transferencia" onClick={() => void update(record, 'restore')}><RotateCcw size={16} /></button> : <button className="icon-button delete-action" aria-label="Eliminar transferencia" onClick={() => void update(record, 'delete')}><Trash2 size={16} /></button>}</div></article>; })}</div> : <div className="empty-state"><span className="panel-icon"><ArrowRightLeft size={18} /></span><div><strong>Sin transferencias</strong><p>Los movimientos entre cuentas aparecerán aquí.</p></div></div>}</div>;
}
