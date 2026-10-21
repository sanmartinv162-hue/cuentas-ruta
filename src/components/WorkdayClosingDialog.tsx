import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import type { Movement, Workday } from '../types';
import { formatCOP, parseCOP } from '../utils/format';
import { totalsFor } from '../services/ledger';

interface Props {
  workday: Workday;
  accounts: { id: string; name: string; balance: number }[];
  workdays: Workday[];
  movements: Movement[];
  goalCOP: number;
  onCloseDay(amountCOP: number, note: string, accountId?: string): Promise<string | null>;
  onDismiss(): void;
}

function durationText(startedAt: string): string {
  const elapsedMinutes = Math.max(Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000), 0);
  return `${Math.floor(elapsedMinutes / 60)} h ${elapsedMinutes % 60} min`;
}

function profitOf(workday: Workday, movements: Movement[]): number {
  return totalsFor(movements.filter((item) => item.workdayId === workday.id), 'deliveries').profitCOP;
}

export function WorkdayClosingDialog({ workday, accounts, workdays, movements, goalCOP, onCloseDay, onDismiss }: Props) {
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState(accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === 'efectivo')?.id ?? accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const entries = useMemo(() => movements.filter((item) => item.workdayId === workday.id), [movements, workday.id]);
  const totals = totalsFor(entries, 'deliveries');
  const capitalBeforeTransfer = accounts.reduce((sum, account) => sum + account.balance, 0);
  const transferCOP = amountText.trim() ? parseCOP(amountText) ?? 0 : 0;
  const previous = workdays.filter((item) => item.id !== workday.id && item.endedAt).at(-1);
  const difference = totals.profitCOP - (previous ? profitOf(previous, movements) : 0);
  const orderCount = entries.filter((item) => item.kind === 'income' && !item.deletedAt).length;
  const average = orderCount > 0 ? Math.round(totals.incomeCOP / orderCount) : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isSafeInteger(transferCOP) || transferCOP < 0 || transferCOP > capitalBeforeTransfer) {
      setError(`El ahorro no puede superar ${formatCOP(capitalBeforeTransfer)}.`);
      return;
    }
    setSaving(true);
    const result = await onCloseDay(transferCOP, note, accountId);
    setSaving(false);
    if (result) setError(result);
    else onDismiss();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onDismiss(); }}>
      <section className="dialog closing-dialog" role="dialog" aria-modal="true" aria-labelledby="closing-title">
        <header className="dialog-header">
          <div className="dialog-mark income"><ArrowDownToLine size={19} /></div>
          <div><p className="eyebrow">CIERRE DE JORNADA</p><h2 id="closing-title">Resumen del día</h2></div>
          <button className="icon-button close-button" type="button" onClick={onDismiss} aria-label="Cerrar" disabled={saving}><X size={18} /></button>
        </header>
        <div className="closing-summary">
          <div><span>Capital para iniciar la jornada</span><strong>{formatCOP(workday.initialCapitalCOP)}</strong></div>
          <div><span>Ingresos</span><strong className="positive">{formatCOP(totals.incomeCOP)}</strong></div>
          <div><span>Gastos</span><strong>{formatCOP(totals.expenseCOP)}</strong></div>
          <div><span>Utilidad</span><strong>{formatCOP(totals.profitCOP)}</strong></div>
          <div className="summary-total"><span>Capital antes del ahorro</span><strong>{formatCOP(capitalBeforeTransfer)}</strong></div>
          <div><span>Tiempo trabajado</span><strong>{durationText(workday.startedAt)}</strong></div>
          <div><span>Meta diaria</span><strong>{totals.incomeCOP >= goalCOP ? 'Alcanzada' : 'Pendiente'}</strong></div>
          {accounts.map((account) => <div key={account.id}><span>Saldo en cuenta al iniciar · {account.name}</span><strong>{formatCOP(workday.initialCapitalByAccount?.[account.id] ?? (account.name.toLocaleLowerCase('es-CO') === 'efectivo' ? workday.initialCapitalCOP : 0))}</strong></div>)}
          {accounts.map((account) => <div key={`final-${account.id}`}><span>Capital final · {account.name}</span><strong>{formatCOP(Math.max(account.balance - (account.id === accountId ? transferCOP : 0), 0))}</strong></div>)}
          <div><span>Comparación con jornada anterior</span><strong>{previous ? `${difference >= 0 ? '+' : '−'}${formatCOP(Math.abs(difference))}` : 'Sin datos'}</strong></div>
          {average > 0 && <div><span>Ingreso promedio por domicilio</span><strong>{formatCOP(average)}</strong></div>}
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span>¿Cuánto dinero deseas enviar al ahorro?</span>
            <div className="amount-input compact-amount"><b>$</b><input inputMode="numeric" value={amountText} onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" /></div>
          </label>
          <label className="field"><span>Cuenta de origen</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label className="field"><span>Comentario (opcional)</span><input className="description-input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="dialog-actions">
            <button className="button quiet-button" type="button" onClick={onDismiss} disabled={saving}>Seguir jornada</button>
            <button className="button primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cierre'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

