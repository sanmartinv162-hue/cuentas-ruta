import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../models/defaults';
import { validateMovement, validateSavingsWithdrawal } from '../models/validation';
import type { MovementDraft } from '../types';

const validDraft: MovementDraft = {
  space: 'personal',
  kind: 'expense',
  amountCOP: 25_000,
  description: 'Mercado',
  occurredAt: new Date().toISOString(),
  paymentMethod: 'Nequi',
  category: 'Alimentación',
  deliveryCount: 0,
};

describe('validaciones de operaciones', () => {
  it('rechaza valores no positivos y fechas futuras', () => {
    const data = createEmptyData();
    expect(validateMovement({ ...validDraft, amountCOP: 0 }, data)).toContain('mayor que cero');
    expect(validateMovement({ ...validDraft, occurredAt: new Date(Date.now() + 86_400_000).toISOString() }, data)).toContain('futuro');
  });

  it('rechaza métodos de pago desconocidos y movimientos duplicados', () => {
    const data = createEmptyData();
    expect(validateMovement({ ...validDraft, paymentMethod: 'Tarjeta' }, data)).toContain('método de pago');
    data.movements.push({
      id: 'existing', ...validDraft,
      occurredAt: new Date(validDraft.occurredAt).toISOString(),
      workdayId: null,
    });
    expect(validateMovement({ ...validDraft, occurredAt: new Date(validDraft.occurredAt).toISOString() }, data)).toContain('idéntico');
  });

  it('impide retirar más del saldo del bolsillo', () => {
    const data = createEmptyData();
    data.savings.push({ id: 'saving-1', kind: 'deposit', amountCOP: 30_000, occurredAt: new Date().toISOString(), note: '' });
    expect(validateSavingsWithdrawal(30_000, data)).toBeNull();
    expect(validateSavingsWithdrawal(30_001, data)).toContain('superar el saldo');
    expect(validateSavingsWithdrawal(0, data)).toContain('mayor que cero');
  });
});
