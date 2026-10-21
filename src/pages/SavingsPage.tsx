import { useMemo, useState, type FormEvent } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, Minus, PiggyBank, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { SavingsMovement } from '../types';
import { formatCOP, parseCOP } from '../utils/format';
import { savingsBalance } from '../services/ledger';

interface Props {
  movements: SavingsMovement[];
  accounts: { id: string; name: string; balance: number }[];
  onWithdraw(amountCOP: number, note: string, accountId?: string): Promise<string | null>;
  onDeposit(amountCOP: number, note: string, accountId?: string): Promise<string | null>;
  onDelete(id: string): Promise<string | null>;
  onRestore(id: string): Promise<string | null>;
}

export function SavingsPage({ movements, accounts, onWithdraw, onDeposit, onDelete, onRestore }: Props) {
  const [operation, setOperation] = useState<'deposit' | 'withdraw' | null>(null);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [showDeleted, setShowDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeMovements = movements.filter((item) => !item.deletedAt);
  const history = movements.filter((item) => showDeleted || !item.deletedAt);
  const balance = savingsBalance(activeMovements);
  const chartData = useMemo(() => {
    let running = 0;
    return [...activeMovements].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map((item) => {
      running += item.kind === 'deposit' ? item.amountCOP : -item.amountCOP;
      return { date: new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(new Date(item.occurredAt)), balance: running };
    });
  }, [activeMovements]);

  function open(nextOperation: 'deposit' | 'withdraw') {
    setOperation(nextOperation);
    setAccountId(accounts[0]?.id ?? '');
    setAmountText('');
    setNote('');
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseCOP(amountText);
    if (!amount) { setError('Escribe un valor mayor que cero.'); return; }
    setSaving(true);
    const save = operation === 'deposit' ? onDeposit : onWithdraw;
    const result = await save(amount, note, accountId);
    setSaving(false);
    if (result) setError(result);
    else { setOperation(null); setAmountText(''); setNote(''); setError(null); }
  }

  async function remove(id: string) {
    if (!window.confirm('Este movimiento se eliminará de forma lógica y podrá restaurarse. ¿Continuar?')) return;
    const result = await onDelete(id);
    setError(result);
  }

  return (
    <div className="page-content">
      <div className="page-heading"><div><p className="eyebrow">BOLSILLO SEPARADO</p><h1>Ahorro del negocio</h1></div><div className="quick-actions"><button className="button outline-button" onClick={() => open('deposit')}><Plus size={16} /> Depositar</button><button className="button outline-button" onClick={() => open('withdraw')} disabled={balance <= 0}><Minus size={16} /> Retirar</button></div></div>
      <section className="savings-overview">
        <div className="savings-total"><span className="panel-icon lime-icon"><PiggyBank size={20} /></span><p className="metric-label">Saldo acumulado</p><strong>{formatCOP(balance)}</strong><p className="savings-note">Este saldo no se cuenta como capital disponible para operar.</p></div>
        <div className="savings-chart"><div className="section-heading"><div><p className="eyebrow">EVOLUCIÓN</p><h2>Saldo en el tiempo</h2></div></div>{chartData.length ? <ResponsiveContainer width="100%" height={190}><AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}><defs><linearGradient id="savingFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#224e3f" stopOpacity={0.2} /><stop offset="100%" stopColor="#224e3f" stopOpacity={0.01} /></linearGradient></defs><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#7a857e' }} minTickGap={18} /><Tooltip formatter={(value) => formatCOP(Number(value))} contentStyle={{ border: '1px solid #e3e8e2', borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="balance" stroke="#224e3f" strokeWidth={2} fill="url(#savingFill)" /></AreaChart></ResponsiveContainer> : <div className="chart-empty">Las transferencias al cierre aparecerán aquí.</div>}</div>
      </section>
      <section className="recent-section savings-history"><div className="section-heading"><div><p className="eyebrow">REGISTRO</p><h2>Historial del ahorro</h2></div><label className="deleted-toggle"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Mostrar eliminados</label><span className="result-count">{history.length} movimientos</span></div>
        {history.length ? <div className="movement-table">{[...history].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((movement) => <article className={`movement-row ${movement.deletedAt ? 'movement-deleted' : ''}`} key={movement.id}><span className={`movement-symbol ${movement.kind === 'deposit' ? 'income' : 'expense'}`} aria-hidden="true">{movement.kind === 'deposit' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div className="recent-description"><strong>{movement.kind === 'deposit' ? 'Transferencia al ahorro' : 'Retiro del ahorro'}</strong><span>{movement.note || 'Sin comentario'} · {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(movement.occurredAt))} · {accounts.find((account) => account.id === movement.accountId)?.name ?? 'Efectivo'}</span></div><strong className={movement.kind === 'deposit' ? 'positive' : ''}>{movement.kind === 'deposit' ? '+' : '−'}{formatCOP(movement.amountCOP)}</strong><div className="row-actions">{movement.deletedAt ? <button className="icon-button" aria-label="Restaurar movimiento de ahorro" onClick={() => void onRestore(movement.id)}><RotateCcw size={16} /></button> : <button className="icon-button delete-action" aria-label="Eliminar movimiento de ahorro" onClick={() => void remove(movement.id)}><Trash2 size={16} /></button>}</div></article>)}</div> : <div className="empty-state"><span className="panel-icon"><PiggyBank size={18} /></span><div><strong>Tu ahorro empieza al cerrar una jornada</strong><p>Registra un depósito, o separa ahorro al finalizar una jornada.</p></div></div>}
      </section>
      {operation && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOperation(null); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="saving-title"><header className="dialog-header"><div className={`dialog-mark ${operation === 'deposit' ? 'income' : 'expense'}`}>{operation === 'deposit' ? <Plus size={19} /> : <Minus size={19} />}</div><div><p className="eyebrow">AHORRO DEL NEGOCIO</p><h2 id="saving-title">{operation === 'deposit' ? 'Registrar depósito' : 'Registrar retiro'}</h2></div></header><p className="balance-hint">Ahorro disponible: <strong>{formatCOP(balance)}</strong></p><form onSubmit={(event) => void submit(event)}><label className="field"><span>Valor</span><div className="amount-input compact-amount"><b>$</b><input autoFocus inputMode="numeric" value={amountText} onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" /></div></label><label className="field"><span>Cuenta del negocio</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {formatCOP(account.balance)}</option>)}</select></label><label className="field"><span>Comentario</span><input className="description-input" value={note} onChange={(event) => setNote(event.target.value)} required maxLength={120} /></label>{error && <p className="form-error" role="alert">{error}</p>}<footer className="dialog-actions"><button className="button quiet-button" type="button" onClick={() => setOperation(null)} disabled={saving}>Cancelar</button><button className="button primary-button" type="submit" disabled={saving || !accounts.length}>{saving ? 'Guardando…' : operation === 'deposit' ? 'Confirmar depósito' : 'Confirmar retiro'}</button></footer></form></section></div>}
    </div>
  );
}
