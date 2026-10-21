import { useState, type FormEvent } from 'react';
import { Play, X } from 'lucide-react';
import { formatCOP } from '../utils/format';

interface Props {
  availableCapital: number;
  onStart(initialCapitalCOP: number): Promise<string | null>;
  className: string;
  disabled?: boolean;
}

export function StartJourneyButton({ availableCapital, onStart, className, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function showDialog() {
    setAmountText(availableCapital > 0 ? String(availableCapital) : '');
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(amountText.replace(/\D/g, ''));
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError('El capital para iniciar debe ser mayor que $0.'); return; }
    if (amount > availableCapital) { setError(`No puedes iniciar con más del capital disponible (${formatCOP(availableCapital)}).`); return; }
    setSaving(true);
    const result = await onStart(amount);
    setSaving(false);
    if (result) setError(result);
    else setOpen(false);
  }

  return <>
    <button className={className} type="button" onClick={showDialog} disabled={disabled}><Play size={15} fill="currentColor" /> Iniciar jornada</button>
    {open && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="start-journey-title">
        <header className="dialog-header"><div className="dialog-mark income"><Play size={18} /></div><div><p className="eyebrow">NEGOCIO DE DOMICILIOS</p><h2 id="start-journey-title">Iniciar jornada</h2></div><button className="icon-button close-button" type="button" onClick={() => setOpen(false)} aria-label="Cerrar" disabled={saving}><X size={18} /></button></header>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field amount-field"><span>Capital para iniciar</span><div className="amount-input"><b>$</b><input autoFocus inputMode="numeric" value={amountText} onChange={(event) => setAmountText(event.target.value.replace(/\D/g, ''))} placeholder="0" aria-label="Capital para iniciar en COP" /></div><small>Disponible en las cuentas del negocio: {formatCOP(availableCapital)}</small></label>
          {availableCapital <= 0 && <p className="form-error" role="status">No hay capital disponible para iniciar. Configura un saldo en las cuentas del negocio primero.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="dialog-actions"><button className="button quiet-button" type="button" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button><button className="button primary-button" type="submit" disabled={saving || availableCapital <= 0}>{saving ? 'Iniciando…' : 'Iniciar jornada'}</button></footer>
        </form>
      </section>
    </div>}
  </>;
}
