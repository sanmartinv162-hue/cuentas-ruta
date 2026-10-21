import { Home, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Header({ title, date }: { title: string; date: string }) {
  return <header className="app-header"><Link className="brand" to="/" aria-label="MI BILLETERA, volver al inicio"><span className="brand-symbol"><Wallet size={18} /></span><span>MI BILLETERA</span></Link><div className="header-title"><span>{title}</span><time>{date}</time></div><Link className="header-settings" to="/" aria-label="Ir al inicio" title="Inicio"><Home size={19} /></Link></header>;
}
