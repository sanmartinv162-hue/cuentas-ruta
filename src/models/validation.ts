import type { AppData, MovementDraft } from '../types';
import { savingsBalance } from '../services/ledger';

export function validateMovement(draft: MovementDraft, data: AppData, editingId?: string): string | null {
  if (!Number.isSafeInteger(draft.amountCOP) || draft.amountCOP <= 0) return 'El valor debe ser un número entero mayor que cero.';
  if (!draft.description.trim()) return 'Escribe una descripción.';
  if (!draft.paymentMethod.trim() || !data.settings.paymentMethods.includes(draft.paymentMethod)) return 'Selecciona un método de pago válido.';
  const date = new Date(draft.occurredAt);
  if (Number.isNaN(date.getTime())) return 'La fecha no es válida.';
  if (date.getTime() > Date.now() + 60_000) return 'La fecha no puede estar en el futuro.';
  if (draft.kind === 'expense' && !draft.category.trim()) return 'Selecciona una categoría para este gasto.';
  if (draft.space !== 'deliveries' && draft.deliveryCount !== 0) return 'Solo los ingresos de domicilios pueden incluir cantidad de entregas.';
  const duplicate = data.movements.some((movement) => movement.id !== editingId && movement.space === draft.space && movement.kind === draft.kind && movement.amountCOP === draft.amountCOP && movement.description.toLocaleLowerCase() === draft.description.trim().toLocaleLowerCase() && movement.occurredAt === draft.occurredAt);
  return duplicate ? 'Ya existe un movimiento idéntico con esa fecha.' : null;
}

export function validateSavingsWithdrawal(amountCOP: number, data: AppData): string | null {
  if (!Number.isSafeInteger(amountCOP) || amountCOP <= 0) return 'El valor debe ser mayor que cero.';
  const balance = savingsBalance(data.savings);
  if (amountCOP > balance) return 'El retiro no puede superar el saldo disponible en ahorro.';
  return null;
}
