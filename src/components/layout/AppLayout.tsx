import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from '../navigation/BottomNavigation';
import { Header } from './Header';
import { PageContainer } from './PageContainer';
import { useAppRuntime } from '../../contexts/AppContexts';

const titles: Record<string, string> = {
  '/': 'Inicio',
  '/personal': 'Finanzas personales',
  '/business': 'Negocio de domicilios',
  '/business/journey': 'Jornada',
  '/business/savings': 'Ahorro',
  '/reports': 'Reportes',
  '/settings': 'Configuración',
};

export function AppLayout() {
  const { pathname } = useLocation();
  const { data, loading, error } = useAppRuntime();
  const title = titles[pathname] ?? 'Página no encontrada';
  const date = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());

  return <div className="app-shell app-frame"><Header title={title} date={date} />{error && <div className="notice notice-error" role="alert">{error}</div>}{loading ? <div className="loading-state">Cargando datos locales…</div> : <PageContainer><Outlet /></PageContainer>}<footer className="app-footer"><span>CUENTAS DE RUTA</span><span>Almacenamiento local · IndexedDB</span><span aria-hidden="true">{data.movements.length} movimientos</span></footer><BottomNavigation /></div>;
}