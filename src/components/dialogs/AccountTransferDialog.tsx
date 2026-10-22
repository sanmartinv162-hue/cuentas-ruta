import { ArrowRightLeft, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { FinancialModule } from '../../types/database';

interface AccountOption { id: string; name: string; balance: number; module: FinancialModule }

export function AccountTransferDialog({ module, accounts, onSave, onClose }: {
  module: FinancialModule;
  accounts: AccountOption[];
  onSave(input: { module: FinancialModule; sourceModule: FinancialModule; destinationModule: FinancialModule; sourceAccountId: string; destinationAccountId: string; amount: number; description: string; date: string }): Promise<string | null>;
  onClose(): void;
}) {
  const [sourceAccountId, setSourceAccountId] = useState(accounts[0]?.id ?? '');
  const [destinationAccountId, setDestinationAccountId] = useState(accounts.find((account) => account.id !== accounts[0]?.id)?.id ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => {
    const current = new Date();
    current.setMinutes(current.getMinutes() - current.getTimezoneOffset());
    return current.toISOString().slice(0, 16);
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const source = accounts.find((account) => account.id === sourceAccountId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount.replace(/[,.\s]/g, ''));
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) { setError('El valor debe ser mayor que cero.'); return; }
    if (sourceAccountId === destinationAccountId) { setError('Elige cuentas distintas.'); return; }
    setSaving(true);
    const sourceModule = source?.module ?? module;
    const destinationModule = accounts.find((account) => account.id === destinationAccountId)?.module ?? module;
    const result = await onSave({ module, sourceModule, destinationModule, sourceAccountId, destinationAccountId, amount: parsedAmount, description: description.trim() || 'Transferencia entre cuentas', date: new Date(date).toISOString() });
    setSaving(false);
    if (result) setError(result);
    else onClose();
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-title"><header className="dialog-header"><div className="dialog-mark income"><ArrowRightLeft size={19} /></div><div><p className="eyebrow">{module === 'personal' ? 'FINANZAS PERSONALES' : 'NEGOCIO DE DOMICILIOS'}</p><h2 id="transfer-title">Transferir entre cuentas</h2></div><button type="button" className="icon-button close-button" onClick={onClose} aria-label="Cerrar" disabled={saving}><X size={18} /></button></header><form onSubmit={(event) => void submit(event)}><label className="field"><span>Cuenta de origen</span><select value={sourceAccountId} onChange={(event) => { setSourceAccountId(event.target.value); if (event.target.value === destinationAccountId) setDestinationAccountId(accounts.find((account) => account.id !== event.target.value)?.id ?? ''); }} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.module === 'personal' ? 'Personal' : 'Negocio'} · disponible {account.balance.toLocaleString('es-CO')} COP</option>)}</select></label><div className="transfer-direction" aria-hidden="true"><ArrowRightLeft size={17} /></div><label className="field"><span>Cuenta de destino</span><select value={destinationAccountId} onChange={(event) => setDestinationAccountId(event.target.value)} required>{accounts.filter((account) => account.id !== sourceAccountId).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.module === 'personal' ? 'Personal' : 'Negocio'}</option>)}</select></label><p className="balance-hint">Disponible en origen: <strong>{(source?.balance ?? 0).toLocaleString('es-CO')} COP</strong></p><label className="field"><span>Valor</span><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,\s]/g, ''))} placeholder="0" required /></label><label className="field"><span>Fecha y hora</span><input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label className="field"><span>Comentario</span><input className="description-input" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} placeholder="Motivo de la transferencia" /></label>{error && <p className="form-error" role="alert">{error}</p>}<footer className="dialog-actions"><button className="button quiet-button" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="button primary-button" type="submit" disabled={saving || accounts.length < 2}>{saving ? 'Guardando…' : 'Transferir'}</button></footer></form></section></div>;
}
