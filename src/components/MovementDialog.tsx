import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import { classifyDescription } from '../ai/categoryClassifier';
import { localDateTimeValue, parseCOP } from '../utils/format';
import type { AppSettings, LedgerSpace, Movement, MovementDraft, MovementKind } from '../types';

interface AccountOption { id: string; name: string }

interface Props {
  space: LedgerSpace;
  kind: MovementKind;
  settings: AppSettings;
  accounts: AccountOption[];
  existing?: Movement;
  onSave(draft: MovementDraft): Promise<string | null>;
  onClose(): void;
}

export function MovementDialog({ space, kind, settings, accounts, existing, onSave, onClose }: Props) {
  const [description, setDescription] = useState(existing?.description ?? '');
  const [amountText, setAmountText] = useState(existing ? String(existing.amountCOP) : '');
  const [occurredAt, setOccurredAt] = useState(existing?.occurredAt.slice(0, 16) ?? localDateTimeValue());
  const [paymentMethod, setPaymentMethod] = useState(existing?.paymentMethod ?? accounts.find((account) => account.name.toLocaleLowerCase('es-CO') === 'efectivo')?.name ?? settings.paymentMethods[0] ?? 'Efectivo');
  const [accountId, setAccountId] = useState(existing?.accountId ?? accounts.find((account) => account.name === paymentMethod)?.id ?? accounts[0]?.id ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectedCategory = useMemo(
    () => kind === 'expense' ? classifyDescription(description, space, settings) : null,
    [description, kind, settings, space],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCOP = parseCOP(amountText);
    if (!amountCOP) { setError('Escribe un valor mayor que cero.'); return; }
    const selectedCategory = category.trim() || detectedCategory || '';
    if (kind === 'expense' && !selectedCategory) {
      setError('Elige una categoría para que pueda aprenderla.');
      return;
    }
    const date = new Date(occurredAt);
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60_000) {
      setError('La fecha debe ser válida y no puede estar en el futuro.');
      return;
    }
    setSaving(true);
    const result = await onSave({
      space,
      kind,
      amountCOP,
      description: description.trim(),
      occurredAt: date.toISOString(),
      paymentMethod,
      accountId,
      category: selectedCategory,
      deliveryCount: 0,
    });
    setSaving(false);
    if (result) setError(result);
    else onClose();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="movement-title">
        <header className="dialog-header">
          <div className={`dialog-mark ${kind}`} aria-hidden="true">{kind === 'income' ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</div>
          <div>
            <p className="eyebrow">{space === 'personal' ? 'FINANZAS PERSONALES' : 'NEGOCIO DE DOMICILIOS'}</p>
            <h2 id="movement-title">{existing ? 'Editar movimiento' : kind === 'income' ? 'Registrar ingreso' : 'Registrar gasto'}</h2>
          </div>
          <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <label className="field amount-field">
            <span>Valor</span>
            <div className="amount-input"><b>$</b><input autoFocus inputMode="numeric" value={amountText} onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" aria-label="Valor en pesos colombianos" /></div>
            <small>COP · pesos colombianos</small>
          </label>
          <label className="field">
            <span>Descripción</span>
            <input className="description-input" value={description} onChange={(event) => { setDescription(event.target.value); setCategory(''); }} placeholder={kind === 'income' ? 'Ej. Domicilios del turno' : 'Ej. Tanqueo de gasolina'} required maxLength={120} />
          </label>
          {kind === 'expense' && (
            <div className="classification-note">
              <span className={`category-dot ${detectedCategory ? 'matched' : ''}`} />
              {detectedCategory ? <span>Categoría detectada: <strong>{detectedCategory}</strong></span> : <span>¿Cómo deseas clasificar este movimiento? La categoría elegida se aprenderá para futuras ocasiones.</span>}
            </div>
          )}
          {kind === 'expense' && (
            <label className="field">
              <span>{detectedCategory ? 'Categoría (puedes corregirla)' : '¿Cómo deseas clasificar este movimiento?'}</span>
              <input value={category || detectedCategory || ''} onChange={(event) => setCategory(event.target.value)} placeholder="Escribe una categoría" required />
            </label>
          )}
          <div className="field-row">
            <label className="field">
              <span>Fecha y hora</span>
              <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required />
            </label>
            <label className="field">
              <span>Cuenta</span>
              <select value={accountId} onChange={(event) => {
                setAccountId(event.target.value);
                setPaymentMethod(accounts.find((account) => account.id === event.target.value)?.name ?? '');
              }} required>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="dialog-actions">
            <button className="button quiet-button" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="button primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : existing ? 'Guardar cambios' : 'Guardar movimiento'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
