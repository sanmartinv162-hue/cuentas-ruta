export function LoadingSpinner({ label = 'Cargando' }: { label?: string }) {
  return <div className="loading-spinner-wrap" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><span>{label}</span></div>;
}