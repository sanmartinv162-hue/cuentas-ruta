import { PrimaryButton, SecondaryButton } from '../buttons/ActionButtons';
import { Modal } from './Modal';

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', onConfirm, onCancel }: { title: string; message: string; confirmLabel?: string; onConfirm(): void; onCancel(): void }) {
  return <Modal title={title} onClose={onCancel}><p className="confirm-copy">{message}</p><footer className="dialog-actions"><SecondaryButton type="button" onClick={onCancel}>Cancelar</SecondaryButton><PrimaryButton type="button" onClick={onConfirm}>{confirmLabel}</PrimaryButton></footer></Modal>;
}