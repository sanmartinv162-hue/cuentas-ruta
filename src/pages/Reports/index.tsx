import { useMemo, useState } from 'react';
import { CalendarDays, ChartNoAxesCombined, Clock3, TrendingUp } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/cards/Card';
import { Section } from '../../components/layout/Section';
import { useAppRuntime } from '../../contexts/AppContexts';
import { buildFinancialReportAnalytics, buildReport, buildReportExportRows, previousReportAnchor } from '../../services/ledger';
import type { ReportRange } from '../../types';
import { dateLabel, formatCOP } from '../../utils/format';

const ranges: { key: ReportRange; label: string; detail: string; icon: typeof Clock3 }[] = [
  { key: 'day', label: 'Diario', detail: 'Actividad de hoy', icon: Clock3 },
  { key: 'week', label: 'Semanal', detail: 'Resumen de la semana', icon: CalendarDays },
  { key: 'month', label: 'Mensual', detail: 'Tendencia del mes', icon: ChartNoAxesCombined },
  { key: 'year', label: 'Anual', detail: 'Balance del año', icon: TrendingUp },
];

function Metric({ label, amount, currency = true }: { label: string; amount: number; currency?: boolean }) {
  return <div className="settings-row"><span>{label}</span><strong>{currency ? formatCOP(amount) : amount.toLocaleString('es-CO')}</strong></div>;
}

const chartColor = { income: '#224e3f', expense: '#d78259', capital: '#224e3f', savings: '#97b85d', nequi: '#7997cf' };
const currencyTooltip = (value: unknown) => formatCOP(Number(value ?? 0));
const exportHeaders = ['Fecha', 'Módulo', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Valor COP'];

function localDate(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function safeCell(value: string): string {
  const clean = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return clean.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function download(content: string, mime: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { data, loading } = useAppRuntime();
  const [range, setRange] = useState<ReportRange>('day');
  const [exportFrom, setExportFrom] = useState(() => localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [exportTo, setExportTo] = useState(() => localDate(new Date()));
  const [exportError, setExportError] = useState<string | null>(null);
  const report = useMemo(() => buildReport(data.movements, data.savings, range, data.settings.dailyGoalCOP), [data.movements, data.savings, data.settings.dailyGoalCOP, range]);
  const previous = useMemo(() => buildReport(data.movements, data.savings, range, data.settings.dailyGoalCOP, previousReportAnchor(range)), [data.movements, data.savings, data.settings.dailyGoalCOP, range]);
  const analytics = useMemo(() => buildFinancialReportAnalytics(data, range), [data, range]);
  const selected = ranges.find((item) => item.key === range)!;
  const accounts = data.accountBalances?.deliveries.accounts ?? [];
  const exportRows = useMemo(() => buildReportExportRows(data, exportFrom, exportTo), [data, exportFrom, exportTo]);
  const bestMonth = range === 'year' ? analytics.points.reduce((best, point) => point.profitCOP > best.profitCOP ? point : best, analytics.points[0]) : undefined;
  const worstMonth = range === 'year' ? analytics.points.reduce((worst, point) => point.profitCOP < worst.profitCOP ? point : worst, analytics.points[0]) : undefined;

  function exportData(format: 'csv' | 'excel') {
    if (!exportFrom || !exportTo || exportFrom > exportTo) { setExportError('Selecciona un rango de fechas válido.'); return; }
    if (!exportRows.length) { setExportError('No hay datos registrados en ese rango.'); return; }
    setExportError(null);
    const filename = `cuentas-ruta-${exportFrom}-${exportTo}`;
    const values = exportRows.map((row) => [row.date, row.module, row.type, row.description, row.category, row.account, String(row.amountCOP)]);
    if (format === 'csv') {
      const csv = [exportHeaders, ...values].map((line) => line.map((value) => `"${(format === 'csv' && /^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      download(`\uFEFF${csv}`, 'text/csv;charset=utf-8', `${filename}.csv`);
      return;
    }
    const table = `<table><thead><tr>${exportHeaders.map((header) => `<th>${safeCell(header)}</th>`).join('')}</tr></thead><tbody>${values.map((row) => `<tr>${row.map((value) => `<td>${safeCell(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    download(`<html><meta charset="utf-8"><body>${table}</body></html>`, 'application/vnd.ms-excel;charset=utf-8', `${filename}.xls`);
  }

  function printPdf() {
    if (!exportFrom || !exportTo || exportFrom > exportTo) { setExportError('Selecciona un rango de fechas válido.'); return; }
    if (!exportRows.length) { setExportError('No hay datos registrados en ese rango.'); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setExportError('Permite abrir la ventana de impresión para guardar el PDF.'); return; }
    const table = `<table><thead><tr>${exportHeaders.map((header) => `<th>${safeCell(header)}</th>`).join('')}</tr></thead><tbody>${exportRows.map((row) => [row.date, row.module, row.type, row.description, row.category, row.account, String(row.amountCOP)].map((value) => `<td>${safeCell(value)}</td>`).join('')).map((row) => `<tr>${row}</tr>`).join('')}</tbody></table>`;
    printWindow.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Reporte ${exportFrom} a ${exportTo}</title><style>body{font:12px Arial,sans-serif;margin:24px;color:#1d2923}h1{font-size:20px}p{color:#59645d}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d9dfda;padding:7px;text-align:left}th{background:#eef2ed}tr{break-inside:avoid}@media print{body{margin:10mm}}</style><body><h1>Reporte financiero</h1><p>Periodo: ${safeCell(exportFrom)} a ${safeCell(exportTo)} · ${exportRows.length} registros</p>${table}</body></html>`);
    printWindow.document.close();
    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
    setExportError(null);
  }

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">LECTURA DEL NEGOCIO</p><h1>Reportes</h1></div></div>
    <Section title="Periodos" eyebrow="REPORTES DISPONIBLES"><div className="report-grid">{ranges.map(({ key, label, detail, icon: Icon }) => <Card className="report-card" key={key}>
      <span className="stat-icon"><Icon size={19} /></span><div><h2>{label}</h2><p>{detail}</p></div>
      <button className={`button ${range === key ? 'primary-button' : 'outline-button'}`} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{range === key ? 'Viendo' : 'Ver'}</button>
    </Card>)}</div></Section>
    {loading ? <p role="status">Cargando reporte…</p> : <>
      <Section title={`${selected.label}: ingresos y gastos`} eyebrow="RESUMEN DEL PERIODO">
        <div className="settings-row"><span>Ingresos</span><strong>{formatCOP(report.incomeCOP)}</strong></div>
        {Object.entries(report.incomeByAccount).map(([account, amount]) => <Metric key={`income-${account}`} label={`Ingresos · ${account}`} amount={amount} />)}
        <div className="settings-row"><span>Gastos</span><strong>{formatCOP(report.expenseCOP)}</strong></div>
        {Object.entries(report.expensesByAccount).map(([account, amount]) => <Metric key={`expense-${account}`} label={`Gastos · ${account}`} amount={amount} />)}
        <Metric label="Utilidad del periodo" amount={report.profitCOP} />
        <Metric label="Ahorro neto del periodo" amount={report.savingsCOP} />
        <Metric label="Días que cumplieron la meta" amount={report.goalReachedDays} currency={false} />
        <Metric label="Movimientos registrados" amount={analytics.movementCount} currency={false} />
        {range === 'day' && <>
          <Metric label="Capital al inicio del día" amount={analytics.initialCapitalCOP} />
          <Metric label="Capital al cierre del día" amount={analytics.finalCapitalCOP} />
          <Metric label="Tiempo trabajado" amount={analytics.workedMinutes} currency={false} />
        </>}
        {range === 'week' && <>
          <Metric label="Promedio diario de utilidad" amount={report.averageDailyProfitCOP} />
          <Metric label={`Mayores ingresos${analytics.highestIncomeDay ? ` · ${dateLabel(analytics.highestIncomeDay.date)}` : ''}`} amount={analytics.highestIncomeDay?.incomeCOP ?? 0} />
          <Metric label={`Mayores gastos${analytics.highestExpenseDay ? ` · ${dateLabel(analytics.highestExpenseDay.date)}` : ''}`} amount={analytics.highestExpenseDay?.expenseCOP ?? 0} />
          <Metric label="Meta de ingresos semanal" amount={data.settings.dailyGoalCOP * 7} />
          <Metric label="Cumplimiento de meta semanal" amount={Math.min(report.incomeCOP / Math.max(data.settings.dailyGoalCOP * 7, 1) * 100, 100)} currency={false} />
        </>}
        {range === 'month' && <Metric label="Promedio diario de utilidad" amount={report.averageDailyProfitCOP} />}
        {range === 'year' && <>
          <Metric label={`Mejor mes${bestMonth ? ` · ${bestMonth.label}` : ''}`} amount={bestMonth?.profitCOP ?? 0} />
          <Metric label={`Peor mes${worstMonth ? ` · ${worstMonth.label}` : ''}`} amount={worstMonth?.profitCOP ?? 0} />
          <Metric label="Utilidad promedio mensual" amount={report.profitCOP / 12} />
          <Metric label="Capital acumulado actual" amount={analytics.finalCapitalCOP} />
        </>}
      </Section>
      <Section title="Capital actual" eyebrow="SALDOS DEL NEGOCIO">
        {accounts.map(({ id, name, balance }) => <Metric key={id} label={`Capital en ${name}`} amount={balance} />)}
        <Metric label="Capital total" amount={data.accountBalances?.deliveries.total ?? 0} />
        <Metric label="Ahorro acumulado" amount={data.savings.filter((item) => !item.deletedAt).reduce((sum, item) => sum + (item.kind === 'deposit' ? item.amountCOP : -item.amountCOP), 0)} />
        <Metric label="Meta diaria" amount={data.settings.dailyGoalCOP} />
      </Section>
      <Section title="Comparación" eyebrow="PERIODO ANTERIOR">
        <Metric label="Ingresos anteriores" amount={previous.incomeCOP} />
        <Metric label="Cambio en ingresos" amount={report.incomeCOP - previous.incomeCOP} />
        <Metric label="Gastos anteriores" amount={previous.expenseCOP} />
        <Metric label="Cambio en gastos" amount={report.expenseCOP - previous.expenseCOP} />
        <Metric label="Utilidad anterior" amount={previous.profitCOP} />
        <Metric label="Cambio en utilidad" amount={report.profitCOP - previous.profitCOP} />
      </Section>
      <Section title="Exportar movimientos" eyebrow="CSV · EXCEL · PDF">
        <div className="report-export-controls">
          <label className="field"><span>Desde</span><input type="date" value={exportFrom} onChange={(event) => setExportFrom(event.target.value)} /></label>
          <label className="field"><span>Hasta</span><input type="date" value={exportTo} onChange={(event) => setExportTo(event.target.value)} /></label>
          <span className="result-count">{exportRows.length} registros</span>
          <button className="button outline-button" type="button" onClick={() => exportData('csv')}>Descargar CSV</button>
          <button className="button outline-button" type="button" onClick={() => exportData('excel')}>Descargar Excel</button>
          <button className="button primary-button" type="button" onClick={printPdf}>Guardar PDF</button>
        </div>
        {exportError && <p className="form-error" role="alert">{exportError}</p>}
      </Section>
      <Section title="Tendencias del negocio" eyebrow="GRÁFICOS INTERACTIVOS">
        <div className="report-chart-grid">
          <div className="report-chart"><h3>Ingresos frente a la meta</h3><ResponsiveContainer width="100%" height={220}><ComposedChart data={analytics.points}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} /><YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={currencyTooltip} /><Legend /><Bar dataKey="goalActualCOP" name={range === 'day' ? 'Ingresos acumulados' : 'Ingresos'} fill={chartColor.income} radius={[4, 4, 0, 0]} /><Line type="monotone" dataKey="goalCOP" name="Meta" stroke="#cfb25a" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>
          <div className="report-chart"><h3>Ingresos vs gastos</h3><ResponsiveContainer width="100%" height={220}><BarChart data={analytics.points}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} /><YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={currencyTooltip} /><Legend /><Bar dataKey="incomeCOP" name="Ingresos" fill={chartColor.income} radius={[4, 4, 0, 0]} /><Bar dataKey="expenseCOP" name="Gastos" fill={chartColor.expense} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          <div className="report-chart"><h3>Capital total</h3><ResponsiveContainer width="100%" height={220}><AreaChart data={analytics.points}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} /><YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={currencyTooltip} /><Area type="monotone" dataKey="capitalCOP" name="Capital" stroke={chartColor.capital} fill="#224e3f" fillOpacity={0.14} /></AreaChart></ResponsiveContainer></div>
          <div className="report-chart"><h3>Ahorro acumulado</h3><ResponsiveContainer width="100%" height={220}><LineChart data={analytics.points}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} /><YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={currencyTooltip} /><Line type="monotone" dataKey="savingsCOP" name="Ahorro" stroke={chartColor.savings} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
          <div className="report-chart"><h3>Efectivo vs Nequi</h3><ResponsiveContainer width="100%" height={220}><LineChart data={analytics.points}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} /><YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={currencyTooltip} /><Legend /><Line type="monotone" dataKey="cashCOP" name="Efectivo" stroke={chartColor.capital} strokeWidth={2} dot={false} /><Line type="monotone" dataKey="nequiCOP" name="Nequi" stroke={chartColor.nequi} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
          <div className="report-chart"><h3>Utilidad</h3><ResponsiveContainer width="100%" height={220}><LineChart data={analytics.points}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} /><YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} /><Tooltip formatter={currencyTooltip} /><Line type="monotone" dataKey="profitCOP" name="Utilidad" stroke={chartColor.income} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
          <div className="report-chart"><h3>Distribución de gastos</h3>{analytics.expenseCategories.length ? <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={analytics.expenseCategories} dataKey="value" nameKey="name" outerRadius={75} label={({ name }) => name}><Cell fill="#d78259" /><Cell fill="#97b85d" /><Cell fill="#7997cf" /><Cell fill="#b58ac6" /><Cell fill="#cfb25a" /></Pie><Tooltip formatter={currencyTooltip} /></PieChart></ResponsiveContainer> : <div className="chart-empty">No hay gastos en este periodo.</div>}</div>
        </div>
      </Section>
    </>}
  </div>;
}
