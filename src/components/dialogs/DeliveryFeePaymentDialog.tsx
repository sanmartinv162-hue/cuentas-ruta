import { useState, type FormEvent } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { formatCOP, parseCOP } from '../../utils/format';

interface AccountOption {
  id: string;
  name: string;
  balance: number;
}

export function DeliveryFeePaymentDialog({ accounts, outstandingCOP, onPay, onClose }: {
  accounts: AccountOption[];
  outstandingCOP: number;
  onPay(amountCOP: number, accountId: string): Promise<string | null>;
  onClose(): void;
}) {
  const [amountText, setAmountText] = useState(String(outstandingCOP));
  const [accountId, setAccountId] = useState(accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === 'efectivo')?.id ?? accounts[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isFullPayment = parseCOP(amountText) === outstandingCOP;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCOP = parseCOP(amountText);
    if (!amountCOP || amountCOP > outstandingCOP) {
      setError(`El pago debe ser mayor que cero y no superar ${formatCOP(outstandingCOP)}.`);
      return;
    }
    if (!accountId) {
      setError('Selecciona una cuenta del negocio.');
      return;
    }
    setSaving(true);
    const result = await onPay(amountCOP, accountId);
    setSaving(false);
    if (result) setError(result);
    else onClose();
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delivery-fee-title">
      <header className="dialog-header">
        <div className="dialog-mark expense"><ArrowUpRight size={19} /></div>
        <div><p className="eyebrow">APARTADO SEMANAL · 15%</p><h2 id="delivery-fee-title">Registrar pago al líder</h2></div>
        <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Cerrar" disabled={saving}><X size={18} /></button>
      </header>
      <p className="balance-hint">Pendiente por pagar: <strong>{formatCOP(outstandingCOP)}</strong>. Puedes registrar un pago parcial.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Valor pagado</span>
          <div className="amount-input"><b>$</b><input inputMode="numeric" value={amountText} onChange={(event) => { setAmountText(event.target.value.replace(/[^\d.,]/g, '')); setError(null); }} required /></div>
        </label>
        <label className="field"><span>Cuenta del negocio</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · disponible {formatCOP(account.balance)}</option>)}</select></label>
        {!accounts.some((account) => account.id === accountId) && <p className="form-error" role="alert">No hay una cuenta del negocio disponible.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="dialog-actions">
          <button className="button quiet-button" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="button primary-button" type="submit" disabled={saving || !accounts.length}>{saving ? 'Guardando…' : isFullPayment ? 'Pagar todo el apartado' : 'Registrar pago parcial'}</button>
        </footer>
      </form>
    </section>
  </div>;
}
