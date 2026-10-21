import { createContext, useContext } from 'react';
import type { AppSettings, AppData, LedgerSpace, Movement, MovementKind, ThemeMode, Workday } from '../types';
import type { LedgerActions } from '../hooks/useLedger';

export interface AppRuntime {
  data: AppData;
  loading: boolean;
  error: string | null;
  actions: LedgerActions;
  notify(message: string): void;
  openMovement(space: LedgerSpace, kind: MovementKind): void;
  editMovement(movement: Movement): void;
  startJourney(initialCapitalCOP: number): Promise<string | null>;
  requestCloseJourney(): void;
  setThemeMode(theme: ThemeMode): void;
}

export interface ThemeValue {
  mode: ThemeMode;
  setMode(theme: ThemeMode): void;
}

export interface JourneyValue {
  active: Workday | undefined;
  start(initialCapitalCOP: number): Promise<string | null>;
  requestClose(): void;
}

export interface UserProfile {
  displayName: string;
}

export const RuntimeContext = createContext<AppRuntime | null>(null);
export const SettingsContext = createContext<AppSettings | null>(null);
export const UserContext = createContext<UserProfile | null>(null);
export const ThemeContext = createContext<ThemeValue | null>(null);
export const JourneyContext = createContext<JourneyValue | null>(null);

export function useAppRuntime(): AppRuntime {
  const context = useContext(RuntimeContext);
  if (!context) throw new Error('useAppRuntime debe usarse dentro de GlobalContexts.');
  return context;
}

export function useAppSettings(): AppSettings {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useAppSettings debe usarse dentro de GlobalContexts.');
  return context;
}

export function useAppUser(): UserProfile | null {
  return useContext(UserContext);
}

export function useAppTheme(): ThemeValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useAppTheme debe usarse dentro de GlobalContexts.');
  return context;
}

export function useJourney(): JourneyValue {
  const context = useContext(JourneyContext);
  if (!context) throw new Error('useJourney debe usarse dentro de GlobalContexts.');
  return context;
}
