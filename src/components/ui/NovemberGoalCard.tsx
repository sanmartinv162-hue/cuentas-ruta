import { CircleCheck, Target } from 'lucide-react';
import type { AppData } from '../../types';
import { buildNovemberGoalSummary } from '../../services/ledger';
import { formatCOP } from '../../utils/format';

export function NovemberGoalCard({ data }: { data: AppData }) {
  const goal = buildNovemberGoalSummary(data);
  const deadlineLabel = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(goal.deadline);

  return <section className="november-goal-card" aria-labelledby="november-goal-title">
    <div className="november-goal-heading">
      <span className="november-goal-icon"><Target size={19} /></span>
      <div><p className="eyebrow">META PERSONAL + NEGOCIO</p><h2 id="november-goal-title">Llegar a {formatCOP(goal.goalCOP)} antes del 15 de noviembre</h2></div>
    </div>
    <div className="november-goal-breakdown">
      <div><span>Personal</span><strong>{formatCOP(goal.personalCOP)}</strong></div>
      <div><span>Negocio</span><strong>{formatCOP(goal.businessCOP)}</strong></div>
      <div><span>Total actual</span><strong>{formatCOP(goal.currentCOP)}</strong></div>
      <div><span>Te falta</span><strong>{formatCOP(goal.remainingCOP)}</strong></div>
    </div>
    <div className="goal-track november-goal-track" role="progressbar" aria-label="Avance de la meta de noviembre" aria-valuenow={Math.round(goal.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${goal.progress * 100}%` }} />
    </div>
    <p className="november-goal-daily">
      {goal.remainingCOP === 0
        ? <><CircleCheck size={15} /> ¡Meta cumplida!</>
        : goal.deadlinePassed
          ? `El plazo venció el ${deadlineLabel}.`
          : <>Aumenta tu capital neto <strong>{formatCOP(goal.dailyNetCOP)} al día</strong> durante {goal.daysRemaining} {goal.daysRemaining === 1 ? 'día' : 'días'} (ingresos menos gastos).</>}
    </p>
    <p className="november-goal-note">Saldo actual leído de tus cuentas personales y del negocio · fecha límite: {deadlineLabel}. No incluye el ahorro separado.</p>
  </section>;
}
