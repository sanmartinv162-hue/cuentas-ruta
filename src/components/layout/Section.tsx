import type { HTMLAttributes, ReactNode } from 'react';

export function Section({ title, eyebrow, action, children, className = '', ...props }: HTMLAttributes<HTMLElement> & { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode }) {
  return <section className={`content-section ${className}`} {...props}><header className="content-section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}