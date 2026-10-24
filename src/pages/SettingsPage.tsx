import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, Moon, Plus, RotateCcw, Sun, Trash2, Upload } from 'lucide-react';
import { downloadBackup, readBackup } from '../database/storage';
import type { AppData, AppSettings, ThemeMode } from '../types';
import type { FinancialModule } from '../types/database';
import { formatCOP, parseCOP } from '../utils/format';
import { dispatchDueNotifications, getNotificationPermission, readNotificationPreferences, requestNotificationPermission, saveNotificationPreferences, type NotificationPreferences } from '../services/notification.service';
import { listAutomaticBackups } from '../services/backup.service';

interface Props {
  data: AppData;
  onSave(settings: AppSettings): Promise<string | null>;
  onImport(data: AppData): Promise<string | null>;
  onTheme(theme: ThemeMode): void;
  accounts: { id: string; module: FinancialModule; name: string }[];
  onCreateAccount(module: FinancialModule, name: string): Promise<string | null>;
  onClearToday(): Promise<string | null>;
  onFactoryReset(): Promise<string | null>;
  onCreateBackup(): Promise<string | null>;
}

export function SettingsPage({ data, onSave, onImport, onTheme, accounts, onCreateAccount, onClearToday, onFactoryReset, onCreateBackup }: Props) {
  const [settings, setSettings] = useState(data.settings);
  const [goalText, setGoalText] = useState(String(data.settings.dailyGoalCOP));
  const [capitalText, setCapitalText] = useState(String(data.settings.startingCapitalCOP));
  const [openingCapital, setOpeningCapital] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((account) => [account.id, String((account.module === 'personal' ? data.settings.personalInitialCapitalByAccount?.[account.id] : data.settings.businessInitialCapitalByAccount?.[account.id]) ?? (account.module === 'business' && account.name.toLocaleLowerCase('es-CO') === 'efectivo' ? data.settings.startingCapitalCOP : 0))])));
  const [newMethod, setNewMethod] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [accountModule, setAccountModule] = useState<FinancialModule>('personal');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState<NotificationPreferences>(() => readNotificationPreferences());
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission);
  const [automaticBackups, setAutomaticBackups] = useState<{ id: string; createdAt: string }[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listAutomaticBackups().then((backups) => setAutomaticBackups(backups.map(({ id, createdAt }) => ({ id, createdAt })))).catch(() => setAutomaticBackups([]));
  }, [data]);

  async function addAccount() {
    const clean = newAccountName.trim();
    if (!clean) { setError('Escribe el nombre de la cuenta.'); return; }
    setSaving(true);
    const result = await onCreateAccount(accountModule, clean);
    setSaving(false);
    if (result) setError(result);
    else { setNewAccountName(''); setError(null); setFeedback('Cuenta creada correctamente.'); }
  }

  function changeBusinessCapital(value: string) {
    const digits = value.replace(/\D/g, '');
    const amount = digits ? Number(digits) : 0;
    setCapitalText(digits);
    setOpeningCapital((current) => {
      const next = { ...current };
      const businessAccounts = accounts.filter((account) => account.module === 'business');
      const cash = businessAccounts.find((account) => account.name.toLocaleLowerCase('es-CO') === 'efectivo');
      for (const account of businessAccounts) next[account.id] = account.id === cash?.id ? String(amount) : '0';
      return next;
    });
  }

  function changeOpeningBalance(accountId: string, value: string) {
    const digits = value.replace(/\D/g, '');
    const next = { ...openingCapital, [accountId]: digits };
    setOpeningCapital(next);
    if (accounts.find((account) => account.id === accountId)?.module === 'business') {
      const total = accounts.filter((account) => account.module === 'business')
        .reduce((sum, account) => sum + Number((next[account.id] ?? '0').replace(/\D/g, '')), 0);
      setCapitalText(String(total));
    }
  }

  useEffect(() => {
    setSettings(data.settings);
    setGoalText(String(data.settings.dailyGoalCOP));
    setCapitalText(String(data.settings.startingCapitalCOP));
    setOpeningCapital(Object.fromEntries(accounts.map((account) => [account.id, String((account.module === 'personal' ? data.settings.personalInitialCapitalByAccount?.[account.id] : data.settings.businessInitialCapitalByAccount?.[account.id]) ?? (account.module === 'business' && account.name.toLocaleLowerCase('es-CO') === 'efectivo' ? data.settings.startingCapitalCOP : 0))])));
  }, [accounts, data.settings]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dailyGoalCOP = parseCOP(goalText);
    const startingCapitalCOP = capitalText.trim() ? Number(capitalText.replace(/\D/g, '')) : 0;
    if (!dailyGoalCOP) { setError('La meta debe ser mayor que cero.'); return; }
    if (!Number.isSafeInteger(startingCapitalCOP) || startingCapitalCOP < 0) { setError('El capital inicial no es válido.'); return; }
    setSaving(true);
    const openingBalances = Object.fromEntries(accounts.filter((account) => account.module === 'business').map((account) => [account.id, Number((openingCapital[account.id] ?? '0').replace(/\D/g, ''))]));
    const personalBalances = Object.fromEntries(accounts.filter((account) => account.module === 'personal').map((account) => [account.id, Number((openingCapital[account.id] ?? '0').replace(/\D/g, ''))]));
    if ([...Object.values(openingBalances), ...Object.values(personalBalances)].some((amount) => !Number.isSafeInteger(amount) || amount < 0)) { setError('El capital inicial por cuenta no puede ser negativo.'); setSaving(false); return; }
    const openingTotal = Object.values(openingBalances).reduce((sum, amount) => sum + amount, 0);
    const result = await onSave({ ...settings, dailyGoalCOP, startingCapitalCOP: openingTotal, businessInitialCapitalByAccount: openingBalances, personalInitialCapitalByAccount: personalBalances });
    setSaving(false);
    setError(result);
    setFeedback(result ? null : 'Configuración guardada.');
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const backup = await readBackup(file);
      if (!window.confirm('La restauración reemplazará los datos actuales. ¿Continuar?')) return;
      const result = await onImport(backup);
      setError(result);
      setFeedback(result ? null : 'Respaldo restaurado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo leer el respaldo.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function clearTodayRecords() {
    if (!window.confirm('Solo se marcarán como eliminados los movimientos, ahorros, transferencias, metas y jornadas registrados hoy. Los datos anteriores y los capitales iniciales se conservarán. ¿Continuar?')) return;
    setSaving(true);
    const result = await onClearToday();
    setSaving(false);
    setError(result);
    setFeedback(result ? null : 'Se limpiaron los registros de hoy; los datos anteriores se conservaron.');
  }

  async function createBackup() {
    setSaving(true);
    const result = await onCreateBackup();
    setSaving(false);
    setError(result);
    setFeedback(result ? null : 'Copia automática creada. Se conservará durante 3 días.');
    if (!result) {
      const backups = await listAutomaticBackups().catch(() => []);
      setAutomaticBackups(backups.map(({ id, createdAt }) => ({ id, createdAt })));
    }
  }

  async function factoryReset() {
    if (!window.confirm('Se creará un respaldo automático y luego se eliminarán todos los movimientos, jornadas, cuentas y configuraciones. Esta acción no se puede deshacer. ¿Continuar?')) return;
    setSaving(true);
    const result = await onFactoryReset();
    setSaving(false);
    setError(result);
    setFeedback(result ? null : 'El proyecto volvió a los valores de fábrica.');
  }

  async function updateNotifications(next: NotificationPreferences) {
    if (next.enabled) {
      const permission = await requestNotificationPermission();
      setNotificationPermission(permission);
      if (permission === 'unsupported') { setError('Este navegador no admite notificaciones.'); return; }
      if (permission !== 'granted') {
        setError(permission === 'denied'
          ? 'El navegador bloqueó las notificaciones. En los controles del sitio junto a la dirección, cambia Notificaciones a Permitir y recarga esta página.'
          : 'Permite las notificaciones en el aviso del navegador para activar los recordatorios.');
        return;
      }
    }
    saveNotificationPreferences(next);
    setNotifications(next);
    setError(null);
    setFeedback(next.enabled ? 'Recordatorios activados.' : 'Recordatorios desactivados.');
    if (next.enabled) dispatchDueNotifications(data);
  }

  return (
    <div className="page-content settings-page">
      <div className="page-heading"><div><p className="eyebrow">PREFERENCIAS</p><h1>Ajustes</h1></div></div>
      <form onSubmit={(event) => void submit(event)}>
        <section className="settings-section">
          <div className="settings-title"><div><p className="eyebrow">JORNADA</p><h2>Meta y capital</h2></div></div>
          <div className="settings-row"><div><strong>Meta diaria</strong><p>Objetivo de ingresos del negocio cada día.</p></div><label className="settings-number"><span aria-hidden="true">$</span><input inputMode="numeric" value={goalText} onChange={(event) => setGoalText(event.target.value.replace(/[^\d]/g, ''))} aria-label="Meta diaria en COP" /><small>COP</small></label></div>
          <div className="settings-row"><div><strong>Capital inicial del negocio</strong><p>Se usa al iniciar la primera jornada y se asigna a Efectivo. Puedes distribuirlo abajo por cuenta.</p></div><label className="settings-number"><span aria-hidden="true">$</span><input inputMode="numeric" value={capitalText} onChange={(event) => changeBusinessCapital(event.target.value)} aria-label="Capital inicial en COP" /><small>COP</small></label></div>
        </section>
        <section className="settings-section"><div className="settings-title"><div><p className="eyebrow">PAGOS</p><h2>Métodos de pago</h2></div></div>
          <div className="payment-methods">{settings.paymentMethods.map((method) => <div className="payment-method" key={method}><span>{method}</span><button className="icon-button delete-action" type="button" aria-label={`Eliminar método ${method}`} disabled={settings.paymentMethods.length <= 1} onClick={() => { setSettings({ ...settings, paymentMethods: settings.paymentMethods.filter((item) => item !== method) }); setFeedback(null); }}><Trash2 size={15} /></button></div>)}</div>
          <div className="add-method-row"><input value={newMethod} onChange={(event) => setNewMethod(event.target.value)} placeholder="Agregar método de pago" maxLength={32} /><button className="button outline-button" type="button" onClick={() => { const clean = newMethod.trim(); if (!clean) return; if (settings.paymentMethods.some((item) => item.toLowerCase() === clean.toLowerCase())) { setError('Ese método de pago ya existe.'); return; } setSettings({ ...settings, paymentMethods: [...settings.paymentMethods, clean] }); setNewMethod(''); setError(null); setFeedback(null); }}><Plus size={15} /> Agregar</button></div>
          <p className="settings-hint">Nequi y Efectivo están disponibles por defecto.</p>
        </section>
        <section className="settings-section"><div className="settings-title"><div><p className="eyebrow">APARIENCIA</p><h2>Tema</h2></div></div><div className="theme-options">{(['system', 'light', 'dark'] as ThemeMode[]).map((theme) => <button type="button" key={theme} className={`theme-option ${settings.theme === theme ? 'selected' : ''}`} onClick={() => { setSettings({ ...settings, theme }); onTheme(theme); }} aria-pressed={settings.theme === theme}>{theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}{theme === 'system' ? 'Sistema' : theme === 'light' ? 'Claro' : 'Oscuro'}</button>)}</div></section>
        <section className="settings-section"><div className="settings-title"><div><p className="eyebrow">RECORDATORIOS</p><h2>Notificaciones opcionales</h2></div></div>
          <label className="settings-row"><span>Activar notificaciones del navegador</span><input type="checkbox" checked={notifications.enabled} onChange={(event) => void updateNotifications({ ...notifications, enabled: event.target.checked })} /></label>
          <p className="settings-hint">Activa primero el interruptor principal; después podrás elegir los recordatorios. Los avisos funcionan mientras la aplicación está abierta.</p>
          {notificationPermission === 'denied' && <p className="form-error" role="status">El permiso está bloqueado por el navegador. Pulsa el icono de controles del sitio junto a la dirección de MI BILLETERA, cambia Notificaciones a Permitir y recarga la página.</p>}
          {notificationPermission === 'unsupported' && <p className="form-error" role="status">Este navegador no admite notificaciones.</p>}
          <div className="notification-options">{([['startWorkday', 'Recordar iniciar la jornada'], ['recordMovements', 'Recordar registrar movimientos'], ['finishWorkday', 'Recordar revisar el cierre'], ['savings', 'Recordar registrar ahorro'], ['weeklyReport', 'Avisar cuando esté listo el resumen semanal']] as [keyof Omit<NotificationPreferences, 'enabled'>, string][]).map(([key, label]) => <label className="settings-row" key={key}><span>{label}</span><input type="checkbox" disabled={!notifications.enabled} checked={notifications[key]} onChange={(event) => void updateNotifications({ ...notifications, [key]: event.target.checked })} /></label>)}</div>
        </section>
        <section className="settings-section"><div className="settings-title"><div><p className="eyebrow">CAPITAL</p><h2>Cuentas financieras</h2></div></div>
          <label className="field"><span>Módulo</span><select value={accountModule} onChange={(event) => setAccountModule(event.target.value as FinancialModule)}><option value="personal">Finanzas personales</option><option value="business">Negocio de domicilios</option></select></label>
          <div className="payment-methods">{accounts.filter((account) => account.module === accountModule).map((account) => <span className="payment-method" key={account.id}>{account.name}</span>)}</div>
          <div className="add-method-row"><input value={newAccountName} onChange={(event) => setNewAccountName(event.target.value)} placeholder="Nombre de nueva cuenta" maxLength={64} /><button className="button outline-button" type="button" onClick={() => void addAccount()} disabled={saving}><Plus size={15} /> Crear cuenta</button></div>
          <p className="settings-hint">Efectivo y Nequi se mantienen como cuentas iniciales independientes por módulo.</p>
          <div className="settings-title opening-capital-heading"><div><p className="eyebrow">CAPITAL INICIAL · {accountModule === 'personal' ? 'FINANZAS PERSONALES' : 'NEGOCIO'}</p><h2>Saldo de apertura por cuenta</h2></div></div>
          {accounts.filter((account) => account.module === accountModule).map((account) => <label className="settings-row" key={account.id}><span>{account.name}</span><span className="settings-number"><span aria-hidden="true">$</span><input inputMode="numeric" value={openingCapital[account.id] ?? '0'} onChange={(event) => changeOpeningBalance(account.id, event.target.value)} aria-label={`Capital inicial en ${account.name}`} /><small>COP</small></span></label>)}
        </section>
        {error && <p className="form-error" role="alert">{error}</p>}{feedback && <p className="form-success" role="status">{feedback}</p>}
        <button className="button primary-button settings-save" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ajustes'}</button>
      </form>
      <section className="settings-section backup-section"><div className="settings-title"><div><p className="eyebrow">REGISTROS DE HOY</p><h2>Limpiar el día</h2></div></div><p>Marca como eliminados los movimientos, ahorros, transferencias, metas y jornadas de hoy. Los días anteriores y los capitales iniciales se conservan.</p><button className="button outline-button delete-action" type="button" onClick={() => void clearTodayRecords()} disabled={saving}>Poner en 0 lo de hoy</button></section>
      <section className="settings-section backup-section"><div className="settings-title"><div><p className="eyebrow">TUS DATOS</p><h2>Respaldo local</h2></div></div><p>La aplicación crea una copia automática al cargar o guardar datos y conserva las copias de los últimos 3 días; las anteriores se eliminan automáticamente.</p><div className="backup-actions"><button className="button outline-button" type="button" onClick={() => void createBackup()} disabled={saving}><RotateCcw size={16} /> Crear copia ahora</button><button className="button outline-button" type="button" onClick={() => downloadBackup(data)} disabled={saving}><Download size={16} /> Exportar respaldo</button><button className="button outline-button" type="button" onClick={() => fileInput.current?.click()} disabled={saving}><Upload size={16} /> Restaurar respaldo</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => void restore(event.target.files?.[0])} /></div><p className="backup-count">{automaticBackups.length} copias automáticas vigentes · {data.movements.length} movimientos · {data.workdays.length} jornadas · saldo de ahorro {formatCOP(data.savings.reduce((sum, item) => sum + (item.kind === 'deposit' ? item.amountCOP : -item.amountCOP), 0))}</p></section>
      <section className="settings-section backup-section"><div className="settings-title"><div><p className="eyebrow">RECUPERACIÓN</p><h2>Restablecer proyecto</h2></div></div><p>Conserva el respaldo automático actual y devuelve la aplicación a sus cuentas, capital y configuraciones iniciales.</p><button className="button outline-button delete-action" type="button" onClick={() => void factoryReset()} disabled={saving}><RotateCcw size={16} /> Restablecer todo de fábrica</button></section>
      <section className="settings-section"><div className="settings-title"><div><p className="eyebrow">APLICACIÓN</p><h2>Información de la aplicación</h2></div></div><div className="settings-row"><div><strong>MI BILLETERA</strong><p>Finanzas personales y control del negocio de domicilios.</p></div><span className="result-count">Versión 1.0.0</span></div><div className="settings-row"><div><strong>Almacenamiento</strong><p>Los datos se guardan localmente en este dispositivo.</p></div><span className="result-count">IndexedDB</span></div></section>
    </div>
  );
}
