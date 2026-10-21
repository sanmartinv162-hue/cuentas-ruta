export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percentage = Math.min(Math.max(Math.round(value * 100), 0), 100);
  return <div className="progress-root"><div className="progress-label"><span>{label}</span><strong>{percentage}%</strong></div><div className="progress-track" role="progressbar" aria-label={label} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percentage}%` }} /></div></div>;
}