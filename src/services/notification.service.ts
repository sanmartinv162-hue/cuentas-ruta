import type { AppData } from '../types';
import { buildReport } from './ledger';

const PREFERENCES_KEY = 'cuentas-ruta.notifications.v1';
const LAST_SHOWN_KEY = 'cuentas-ruta.notifications.last.v1';

export interface NotificationPreferences {
  enabled: boolean;
  startWorkday: boolean;
  recordMovements: boolean;
  finishWorkday: boolean;
  savings: boolean;
  weeklyReport: boolean;
}

export interface Reminder {
  key: keyof Omit<NotificationPreferences, 'enabled'>;
  title: string;
  body: string;
}

export const defaultNotificationPreferences: NotificationPreferences = {
  enabled: false, startWorkday: true, recordMovements: true,
  finishWorkday: true, savings: true, weeklyReport: true,
};

export function readNotificationPreferences(): NotificationPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return defaultNotificationPreferences;
    return { ...defaultNotificationPreferences, ...(value as Partial<NotificationPreferences>) };
  } catch { return defaultNotificationPreferences; }
}

export function saveNotificationPreferences(preferences: NotificationPreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (getNotificationPermission() === 'unsupported') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function buildReminders(data: AppData, preferences: NotificationPreferences, now = new Date()): Reminder[] {
  if (!preferences.enabled) return [];
  const reminders: Reminder[] = [];
  const hour = now.getHours();
  const active = data.workdays.find((workday) => workday.endedAt === null);
  const todayMovements = data.movements.filter((movement) => !movement.deletedAt && new Date(movement.occurredAt).toDateString() === now.toDateString());
  const todaySavings = data.savings.filter((saving) => !saving.deletedAt && new Date(saving.occurredAt).toDateString() === now.toDateString());
  if (preferences.startWorkday && !active && hour >= 8 && hour < 11) reminders.push({ key: 'startWorkday', title: 'Inicia tu jornada', body: 'Cuando empieces, registra la jornada para llevar el control del negocio.' });
  if (preferences.recordMovements && active && !todayMovements.length && hour >= 12 && hour < 18) reminders.push({ key: 'recordMovements', title: 'Registra tus movimientos', body: 'Aún no hay movimientos de hoy en la jornada activa.' });
  if (preferences.finishWorkday && active && now.getTime() - new Date(active.startedAt).getTime() >= 8 * 60 * 60 * 1000) reminders.push({ key: 'finishWorkday', title: 'Revisa el cierre de jornada', body: 'Tu jornada lleva ocho horas o más. Puedes revisar el resumen y cerrarla cuando corresponda.' });
  if (preferences.savings && hour >= 19 && !todaySavings.some((saving) => saving.kind === 'deposit')) reminders.push({ key: 'savings', title: 'Revisa tu ahorro', body: 'Si separaste dinero hoy, registra el depósito para mantener actualizado el saldo.' });
  if (preferences.weeklyReport && now.getDay() === 5 && hour >= 16) {
    const current = buildReport(data.movements, data.savings, 'week', data.settings.dailyGoalCOP, now);
    reminders.push({ key: 'weeklyReport', title: 'Resumen semanal listo', body: `Ingresos ${Math.round(current.incomeCOP).toLocaleString('es-CO')} COP · gastos ${Math.round(current.expenseCOP).toLocaleString('es-CO')} COP · utilidad ${Math.round(current.profitCOP).toLocaleString('es-CO')} COP.` });
  }
  return reminders;
}

export function dispatchDueNotifications(data: AppData, now = new Date()): void {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  const reminders = buildReminders(data, readNotificationPreferences(), now);
  let shown: Record<string, string> = {};
  try { shown = JSON.parse(localStorage.getItem(LAST_SHOWN_KEY) ?? '{}') as Record<string, string>; } catch { shown = {}; }
  const dateKey = now.toISOString().slice(0, 10);
  for (const reminder of reminders) {
    if (shown[reminder.key] === dateKey) continue;
    shown[reminder.key] = dateKey;
    try { new Notification(reminder.title, { body: reminder.body, icon: '/icon.svg', tag: `${reminder.key}-${dateKey}` }); } catch { /* Notifications are best effort. */ }
  }
  try { localStorage.setItem(LAST_SHOWN_KEY, JSON.stringify(shown)); } catch { /* Keep reminders usable if storage is unavailable. */ }
}
