import type { ReactNode } from 'react';
import { JourneyContext, RuntimeContext, SettingsContext, ThemeContext, UserContext } from '../contexts/AppContexts';
import type { AppRuntime, JourneyValue, ThemeValue } from '../contexts/AppContexts';

export type { AppRuntime } from '../contexts/AppContexts';

export function AppProviders({ value, children }: { value: AppRuntime; children: ReactNode }) {
  const theme: ThemeValue = { mode: value.data.settings.theme, setMode: value.setThemeMode };
  const journey: JourneyValue = {
    active: value.data.workdays.find((workday) => workday.endedAt === null),
    start: value.startJourney,
    requestClose: value.requestCloseJourney,
  };

  return <RuntimeContext.Provider value={value}><SettingsContext.Provider value={value.data.settings}><UserContext.Provider value={null}><ThemeContext.Provider value={theme}><JourneyContext.Provider value={journey}>{children}</JourneyContext.Provider></ThemeContext.Provider></UserContext.Provider></SettingsContext.Provider></RuntimeContext.Provider>;
}