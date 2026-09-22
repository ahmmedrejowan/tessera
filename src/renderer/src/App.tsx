import CircularProgress from '@mui/material/CircularProgress';
import { useState, type ReactNode } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastHost } from './components/Toast';
import { AddMenu } from './import/AddMenu';
import { DropOverlay } from './import/DropOverlay';
import { ImportDialog } from './import/ImportDialog';
import { BrowsePage } from './pages/browse/BrowsePage';
import { CollectionPage } from './pages/collections/CollectionPage';
import { CollectionsPage } from './pages/collections/CollectionsPage';
import { HomePage } from './pages/HomePage';
import { InboxPage } from './pages/InboxPage';
import { SettingsPage } from './pages/SettingsPage';
import { CommandPalette } from './shell/CommandPalette';
import { MenuCommands } from './shell/MenuCommands';
import { CopyConfirm } from './pages/projects/CopyConfirm';
import { ProjectPage } from './pages/projects/ProjectPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { PackPage } from './pages/pack/PackPage';
import { Welcome } from './pages/Welcome';
import { AppShell } from './shell/AppShell';
import { useLibraryState, useStats } from './state/library';
import { useNav } from './state/nav';

function Current() {
  const route = useNav((s) => s.route);
  switch (route.to) {
    case 'home':
      return <HomePage />;
    case 'browse':
      return <BrowsePage />;
    case 'pack':
      return <PackPage key={route.id} id={route.id} />;
    case 'inbox':
      return <InboxPage />;
    case 'collections':
      return <CollectionsPage />;
    case 'collection':
      return <CollectionPage key={route.id} id={route.id} />;
    case 'projects':
      return <ProjectsPage />;
    case 'project':
      return <ProjectPage key={route.id} id={route.id} />;
    case 'settings':
      return <SettingsPage />;
  }
}

/** An error boundary that resets when the page changes. */
function RoutedBoundary({ children }: { children: ReactNode }) {
  const route = useNav((s) => s.route);
  return <ErrorBoundary resetKey={JSON.stringify(route)}>{children}</ErrorBoundary>;
}

export function App() {
  const state = useLibraryState().data;
  const inbox = useStats().data?.inbox;
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  if (!state) return null;
  if (state.status === 'opening') {
    return (
      <AppShell bare onAdd={() => undefined}>
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </div>
      </AppShell>
    );
  }
  if (state.status !== 'ready') {
    return (
      <AppShell bare onAdd={() => undefined}>
        <Welcome state={state} />
      </AppShell>
    );
  }
  return (
    <>
      <AppShell onAdd={setAddAnchor} {...(inbox ? { inboxCount: inbox } : {})}>
        <RoutedBoundary>
          <Current />
        </RoutedBoundary>
      </AppShell>
      <AddMenu anchor={addAnchor} onClose={() => setAddAnchor(null)} />
      <ImportDialog />
      <CopyConfirm />
      <CommandPalette />
      <MenuCommands />
      <DropOverlay enabled />
      <ToastHost />
    </>
  );
}
