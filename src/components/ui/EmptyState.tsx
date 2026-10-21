import type { ReactNode } from 'react';

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="panel-icon" aria-hidden="true">{icon}</span><div><strong>{title}</strong><p>{description}</p>{action}</div></div>;
}