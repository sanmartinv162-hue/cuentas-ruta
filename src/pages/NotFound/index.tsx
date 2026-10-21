import { ArrowLeft, CircleHelp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';

export default function NotFoundPage() {
  return <div className="page-content not-found-page"><div className="page-heading"><div><p className="eyebrow">ERROR 404</p><h1>Página no encontrada</h1></div></div><EmptyState icon={<CircleHelp size={20} />} title="No encontramos esta página" description="La dirección puede haber cambiado o no existir." action={<Link className="button primary-button" to="/"><ArrowLeft size={15} /> Volver al inicio</Link>} /></div>;
}