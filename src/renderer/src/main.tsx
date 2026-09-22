import '@fontsource-variable/roboto-flex';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useImport } from './state/importer';
import { queryClient } from './state/queries';
import { AppThemeProvider } from './theme/AppThemeProvider';

// Automated UI tests stand in for native file dialogs and drag and drop.
if (window.tessera.e2e) Object.assign(window, { __tessera: { importPaths: (paths: string[], eachInside = false) => useImport.getState().plan(paths, eachInside) } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <App />
      </AppThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
