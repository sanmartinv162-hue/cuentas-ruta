import { AlertCircle, Check, X } from 'lucide-react';
import { useEffect } from 'react';

export function Toast({ message, tone = 'success', onDismiss }: { message: string; tone?: 'success' | 'error'; onDismiss(): void }) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  const Icon = tone === 'error' ? AlertCircle : Check;
  return <div className={`app-toast ${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite"><Icon size={17} /><span>{message}</span><button type="button" onClick={onDismiss} aria-label="Cerrar aviso"><X size={16} /></button></div>;
}