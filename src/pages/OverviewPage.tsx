import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bike, CircleCheck, Plus, Wallet } from 'lucide-react';
import type { AppData, LedgerSpace, Movement, MovementKind } from '../types';
import { buildDashboardSummary } from '../services/ledger';
import { formatCOP } from '../utils/format';
import { GlobalSearch } from '../components/GlobalSearch';
import { StartJourneyButton } from '../components/StartJourneyButton';

interface Props {
  data: AppData;
  onNew(space: LedgerSpace, kind: MovementKind): void;
  onStartWorkday(initialCapitalCOP: number): Promise<string | null>;
  onFinishWorkday(): void;
  onOpenHistory(): void;
  onOpenPersonal(): void;
  onOpenBusiness(): void;
  onEdit(movement: Movement): void;
  onNavigate(path: string): void;
}

export function OverviewPage({ data, onNew, onStartWorkday, onFinishWorkday, onOpenHistory, onOpenPersonal, onOpenBusiness, onEdit, onNavigate }: Props) {
  const summary = buildDashboardSummary(data);
  const workday = summary.activeWorkday;
  const accountBalances = data.accountBalances;
  const personalCapital = accountBalances?.personal.total ?? 0;
  const businessAvailable = accountBalances?.deliveries.total ?? data.settings.startingCapitalCOP;
  const todayTotals = summary.businessToday;
  const progress = summary.businessGoalProgress;
  const recent = summary.personalRecent;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div><p className="eyebrow">{new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()}</p><h1>Resumen</h1></div>
        <div className="quick-actions">
          <button className="button primary-button" onClick={() => onNew('personal', 'expense')}><Plus size={16} /> Movimiento</button>
          <button className="button outline-button" onClick={() => onNew('deliveries', 'income')}><Bike size={16} /> Domicilio</button>
        </div>
      </div>

      <div className="ledger-grid dashboard-grid">
        <article className="ledger-panel personal-panel">
          <div className="panel-heading"><span className="panel-icon"><Wallet size={19} /></span><div><p className="eyebrow">ESPACIO 01</p><h2>Finanzas personales</h2></div></div>
          <p className="metric-label">Capital disponible</p>
          <p className="hero-amount">{formatCOP(personalCapital)}</p>
          {accountBalances && <div className="business-submetrics"><span>Efectivo<strong>{formatCOP(accountBalances.personal.accounts.find((account) => account.name.toLowerCase() === 'efectivo')?.balance ?? 0)}</strong></span><span>Nequi<strong>{formatCOP(accountBalances.personal.accounts.find((account) => account.name.toLowerCase() === 'nequi')?.balance ?? 0)}</strong></span></div>}
          <div className="panel-rule" />
          <div className="metric-pair">
            <div><span className="metric-label"><ArrowDownLeft size={14} /> Ingresos del mes</span><strong className="positive">{formatCOP(summary.personalMonth.incomeCOP)}</strong></div>
            <div><span className="metric-label"><ArrowUpRight size={14} /> Gastos del mes</span><strong>{formatCOP(summary.personalMonth.expenseCOP)}</strong></div>
            <div><span className="metric-label">Balance del mes</span><strong>{formatCOP(summary.personalMonth.profitCOP)}</strong></div>
          </div>
          <div className="action-row"><button className="text-action" onClick={() => onNew('personal', 'income')}>Registrar ingreso <ArrowRight size={14} /></button><button className="text-action" onClick={() => onNew('personal', 'expense')}>Registrar gasto <ArrowRight size={14} /></button><button className="text-action" onClick={onOpenPersonal}>Entrar <ArrowRight size={14} /></button></div>
        </article>

        <article className="ledger-panel delivery-panel">
          <div className="panel-heading"><span className="panel-icon lime-icon"><Bike size={20} /></span><div><p className="eyebrow">ESPACIO 02</p><h2>Negocio de domicilios</h2></div><span className={`shift-badge ${workday ? 'shift-active' : ''}`}>{workday ? 'Jornada abierta' : 'Jornada cerrada'}</span></div>
          <p className="metric-label">Capital disponible{workday ? ' hoy' : ''}</p>
          <p className="hero-amount">{formatCOP(businessAvailable)}</p>
          <div className="business-submetrics">{accountBalances?.deliveries.accounts.map((account) => <span key={account.id}>{account.name}<strong>{formatCOP(account.balance)}</strong></span>)}<span>En ahorro<strong>{formatCOP(summary.savingsCOP)}</strong></span><span>Ingresos hoy<strong>{formatCOP(todayTotals.incomeCOP)}</strong></span><span>Gastos hoy<strong>{formatCOP(todayTotals.expenseCOP)}</strong></span><span>Utilidad hoy<strong>{formatCOP(todayTotals.profitCOP)}</strong></span></div>
          <div className="goal-block">
            <div className="goal-caption"><span>Meta diaria · {formatCOP(todayTotals.incomeCOP)} / {formatCOP(data.settings.dailyGoalCOP)}</span><strong>{Math.round(progress * 100)}%{summary.businessGoalExcess > 0 && ` · +${formatCOP(summary.businessGoalExcess)}`}</strong></div>
            <div className="goal-track" role="progressbar" aria-label="Avance de la meta diaria" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress * 100}%` }} /></div>
            <p>{summary.businessGoalRemaining === 0 ? <><CircleCheck size={13} /> {summary.businessGoalExcess > 0 ? 'Superaste tu meta.' : 'Meta alcanzada.'}</> : <>Te faltan {formatCOP(summary.businessGoalRemaining)}</>}</p>
          </div>
          <p className="section-footnote">{workday ? `Jornada activa · ${Math.floor(summary.workdayDurationMinutes / 60)} h ${summary.workdayDurationMinutes % 60} min` : 'Sin jornada abierta'} · {summary.businessMovementCount} movimientos de hoy</p>
          <div className="action-row"><button className="text-action" onClick={() => onNew('deliveries', 'income')}>Registrar ingreso <ArrowRight size={14} /></button><button className="text-action" onClick={() => onNew('deliveries', 'expense')}>Registrar gasto <ArrowRight size={14} /></button></div>
          <div className="action-row"><button className="text-action" onClick={onOpenBusiness}>Entrar <ArrowRight size={14} /></button></div>
          {workday ? <button className="button finish-button shift-button" onClick={onFinishWorkday}><CircleCheck size={15} /> Finalizar jornada</button> : <StartJourneyButton className="button outline-button shift-button" availableCapital={accountBalances?.deliveries.total ?? 0} onStart={onStartWorkday} />}
        </article>
      </div>

      <GlobalSearch data={data} onEdit={onEdit} onNavigate={onNavigate} />

      {summary.recommendations.length > 0 && <section className="recent-section"><div className="section-heading"><div><p className="eyebrow">ASISTENTE FINANCIERO</p><h2>Recomendaciones de hoy</h2></div></div><div className="empty-state"><div>{summary.recommendations.map((recommendation) => <p key={recommendation}>{recommendation}</p>)}</div></div></section>}

      <section className="recent-section">
        <div className="section-heading"><div><p className="eyebrow">ACTIVIDAD</p><h2>Movimientos recientes</h2></div><button className="text-action" onClick={onOpenHistory}>Ver historial <ArrowRight size={14} /></button></div>
        {recent.length ? <div className="recent-list">{recent.map((movement: Movement) => <div className="recent-row" key={movement.id}><span className={`movement-symbol ${movement.kind}`} aria-hidden="true">{movement.kind === 'income' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div className="recent-description"><strong>{movement.description}</strong><span>{movement.space === 'personal' ? 'Personal' : 'Domicilios'} · {movement.paymentMethod} · {new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(movement.occurredAt))}</span></div><strong className={movement.kind === 'income' ? 'positive' : ''}>{movement.kind === 'income' ? '+' : '−'}{formatCOP(movement.amountCOP)}</strong></div>)}</div> : <div className="empty-state"><span className="panel-icon"><Wallet size={18} /></span><div><strong>Sin movimientos todavía</strong><p>Empieza registrando un ingreso o gasto. Cada espacio conserva sus propios saldos.</p></div></div>}
      </section>
    </div>
  );
}
