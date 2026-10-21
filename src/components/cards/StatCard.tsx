import type { ReactNode } from 'react';
import { Card } from './Card';

export function StatCard({ label, value, icon, detail }: { label: string; value: string; icon: ReactNode; detail?: string }) {
  return <Card className="stat-card"><span className="stat-icon" aria-hidden="true">{icon}</span><span className="stat-label">{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</Card>;
}