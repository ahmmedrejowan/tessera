import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { call } from '../api';
import { useSettings } from '../state/queries';
import { createAppTheme, schemeCss, schemeFromSeed } from '.';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const subscribe = (cb: () => void) => {
  darkQuery.addEventListener('change', cb);
  return () => darkQuery.removeEventListener('change', cb);
};

/** True when the app should be dark: the setting, or the system's appearance when set to "system". */
export function useIsDark(): boolean {
  const systemDark = useSyncExternalStore(subscribe, () => darkQuery.matches);
  const mode = useSettings().data?.theme ?? 'system';
  return mode === 'dark' || (mode === 'system' && systemDark);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const settings = useSettings().data;
  const dark = useIsDark();
  const seed = settings?.seedColor ?? '#3f6f8f';
  const scheme = useMemo(() => schemeFromSeed(seed, dark), [seed, dark]);
  const theme = useMemo(() => createAppTheme(scheme, dark), [scheme, dark]);

  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(schemeCss(scheme))) root.style.setProperty(name, value);
    root.style.colorScheme = dark ? 'dark' : 'light';
    // Windows and Linux draw their window buttons over the app bar: keep them in its colours.
    void call('window:chrome', { background: scheme.surfaceContainer, foreground: scheme.onSurfaceVariant }).catch(() => undefined);
  }, [scheme, dark]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
