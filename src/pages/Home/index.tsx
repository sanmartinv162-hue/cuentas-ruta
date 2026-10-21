import { useNavigate } from 'react-router-dom';
import { useAppRuntime } from '../../contexts/AppContexts';
import { OverviewPage } from '../OverviewPage';

export default function HomePage() {
  const { data, openMovement, editMovement, startJourney, requestCloseJourney, notify } = useAppRuntime();
  const navigate = useNavigate();

  async function start(initialCapitalCOP: number) {
    const result = await startJourney(initialCapitalCOP);
    notify(result ?? 'Jornada iniciada.');
    return result;
  }

  return <OverviewPage data={data} onNew={openMovement} onStartWorkday={start} onFinishWorkday={requestCloseJourney} onOpenHistory={() => navigate('/personal')} onOpenPersonal={() => navigate('/personal')} onOpenBusiness={() => navigate('/business')} onEdit={editMovement} onNavigate={(path) => navigate(path)} />;
}
