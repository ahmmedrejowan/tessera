import CircularProgress from '@mui/material/CircularProgress';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogHost } from './notices/DialogHost';
import { NoticeHost } from './notices/NoticeHost';
import { ReportsHost } from './reports/ReportsHost';
import { LibraryDialog } from './pages/library/LibraryDialog';
import { Guides } from './pages/library/guides';
import { AddMenu } from './import/AddMenu';
import { DropOverlay } from './import/DropOverlay';
import { ImportDialog } from './import/ImportDialog';
import { BrowsePage } from './pages/browse/BrowsePage';
import { CollectionPage } from './pages/collections/CollectionPage';
import { CollectionsPage } from './pages/collections/CollectionsPage';
import { HomePage } from './pages/HomePage';
import { InboxPage } from './pages/InboxPage';
import { SettingsPage } from './pages/SettingsPage';
import { MenuCommands } from './shell/MenuCommands';
import { CopyConfirm } from './pages/projects/CopyConfirm';
import { ProjectPage } from './pages/projects/ProjectPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { PackPage } from './pages/pack/PackPage';
import { Welcome } from './pages/Welcome';
import { AppShell } from './shell/AppShell';
import { useLibraryId, useLibraryState, useStats } from './state/library';
import { useBrowse } from './state/browse';
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
  return (
    <ErrorBoundary resetKey={JSON.stringify(route)} page={route.to}>
      {children}
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <>
      <Screen />
      <NoticeHost />
      <DialogHost />
      <ReportsHost />
      <LibraryDialog />
      <Guides />
    </>
  );
}

/** A different library starts fresh: on Home, with no search, filters or history from the last. */
function useFreshStartPerLibrary() {
  const id = useLibraryId();
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!id || seen.current === id) return;
    if (seen.current) {
      useNav.setState({ route: { to: 'home' }, back: [], forward: [] });
      useBrowse.getState().setText('');
      useBrowse.getState().clearFilters();
    }
    seen.current = id;
  }, [id]);
}

function Screen() {
  useFreshStartPerLibrary();
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
      <MenuCommands />
      <DropOverlay enabled />
    </>
  );
}
