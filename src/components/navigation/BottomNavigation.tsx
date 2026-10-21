import { Bike, ChartNoAxesCombined, House, Settings2, Wallet } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/personal', label: 'Personal', icon: Wallet },
  { to: '/business', label: 'Negocio', icon: Bike },
  { to: '/reports', label: 'Reportes', icon: ChartNoAxesCombined },
  { to: '/settings', label: 'Ajustes', icon: Settings2 },
];

export function BottomNavigation() {
  return <nav className="bottom-navigation" aria-label="Navegación principal">{items.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottom-navigation-link ${isActive ? 'active' : ''}`} aria-label={label}><Icon size={19} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>;
}