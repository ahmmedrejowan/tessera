import CircularProgress from '@mui/material/CircularProgress';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DialogHost } from './notices/DialogHost';
import { NewCollectionHost } from './pages/collections/CollectionDialog';
import { NoticeHost } from './notices/NoticeHost';
import { ReportsHost } from './reports/ReportsHost';
import { LibraryDialog } from './pages/library/LibraryDialog';
import { Guides } from './pages/library/guides';
import { ShortcutsDialog } from './shell/Shortcuts';
import { AddMenu } from './import/AddMenu';
import { DropOverlay } from './import/DropOverlay';
import { BrowsePage } from './pages/browse/BrowsePage';
import { CollectionPage } from './pages/collections/CollectionPage';
import { CollectionsPage } from './pages/collections/CollectionsPage';
import { HomePage } from './pages/HomePage';
import { AddPage } from './pages/add/AddPage';
import { InboxPage } from './pages/InboxPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { AboutPage } from './pages/AboutPage';
import { HelpPage } from './pages/help/HelpPage';
import { HelpTopicPage } from './pages/help/HelpTopicPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { MenuCommands } from './shell/MenuCommands';
import { CopyConfirm } from './pages/projects/CopyConfirm';
import { ProjectPage } from './pages/projects/ProjectPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { ArchivePage } from './pages/ArchivePage';
import { ActivityPage } from './pages/ActivityPage';
import { SearchPage } from './pages/SearchPage';
import { BinPage } from './pages/BinPage';
import { PackPage } from './pages/pack/PackPage';
import { Welcome } from './pages/Welcome';
import { AppShell } from './shell/AppShell';
import { useLibraryId, useLibraryState, useStats } from './state/library';
import { useBrowse } from './state/browse';
import { useAdding } from './state/adding';
import { isGoing, useDownloads } from './state/downloads';
import { useNav } from './state/nav';

function Current() {
  const route = useNav((s) => s.route);
  switch (route.to) {
    case 'home':
      return <HomePage />;
    case 'browse':
      return <BrowsePage />;
    case 'pack':
      return <PackPage key={route.id} id={route.id} edit={route.edit ?? false} />;
    case 'inbox':
      return <InboxPage />;
    case 'downloads':
      return <DownloadsPage />;
    case 'activity':
      return <ActivityPage />;
    case 'search':
      return <SearchPage key={route.text} text={route.text} />;
    case 'archive':
      return <ArchivePage />;
    case 'bin':
      return <BinPage />;
    case 'help':
      return <HelpPage />;
    case 'helpTopic':
      return <HelpTopicPage key={route.id} id={route.id} {...(route.question ? { question: route.question } : {})} />;
    case 'about':
      return <AboutPage />;
    case 'notifications':
      return <NotificationsPage />;
    case 'collections':
      return <CollectionsPage />;
    case 'collection':
      return <CollectionPage key={route.id} id={route.id} />;
    case 'projects':
      return <ProjectsPage />;
    case 'project':
      return <ProjectPage key={route.id} id={route.id} />;
    case 'adding':
      return <AddPage />;
    case 'settings':
      return <SettingsPage {...('section' in route ? { section: route.section } : {})} />;
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
      <NewCollectionHost />
      <ReportsHost />
      <LibraryDialog />
      <Guides />
      <ShortcutsDialog />
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
  // Packs open on the add page aren't waiting in Review yet.
  const adding = useAdding((s) => s.drafts.filter((d) => d.packId).length);
  const inbox = Math.max(0, (useStats().data?.inbox ?? 0) - adding);
  const downloading = (useDownloads().data ?? []).filter(isGoing).length;
  // The Downloads page takes drops of its own (links, and files holding links).
  const onDownloads = useNav((s) => s.route.to) === 'downloads';
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
      <AppShell onAdd={setAddAnchor} {...(inbox ? { inboxCount: inbox } : {})} {...(downloading ? { downloadCount: downloading } : {})}>
        <RoutedBoundary>
          <Current />
        </RoutedBoundary>
      </AppShell>
      <AddMenu anchor={addAnchor} onClose={() => setAddAnchor(null)} />
      <CopyConfirm />
      <MenuCommands />
      <DropOverlay enabled={!onDownloads} />
    </>
  );
}
