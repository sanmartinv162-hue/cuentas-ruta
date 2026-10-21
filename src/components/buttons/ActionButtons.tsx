import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
}

export function PrimaryButton({ icon, children, className = '', ...props }: ActionButtonProps) {
  return <button className={`button primary-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`} {...props}>{icon}{children}</button>;
}

export function SecondaryButton({ icon, children, className = '', ...props }: ActionButtonProps) {
  return <button className={`button outline-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`} {...props}>{icon}{children}</button>;
}