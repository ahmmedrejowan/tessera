import CircularProgress from '@mui/material/CircularProgress';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { InboxPage } from './pages/InboxPage';
import { MenuCommands } from './shell/MenuCommands';
import { CopyConfirm } from './pages/projects/CopyConfirm';
import { SearchPage } from './pages/SearchPage';
import { PackPage } from './pages/pack/PackPage';
import { Welcome } from './pages/Welcome';
import { AppShell } from './shell/AppShell';
import { useLibraryId, useLibraryState, useStats } from './state/library';
import { useBrowse } from './state/browse';
import { useAdding } from './state/adding';
import { isGoing, useDownloads } from './state/downloads';
import { useNav } from './state/nav';

// Pages nobody sees on the way in are fetched the first time they are opened, so the window
// starts with the screens it actually needs.
const AddPage = lazy(() => import('./pages/add/AddPage').then((m) => ({ default: m.AddPage })));
const DownloadsPage = lazy(() => import('./pages/DownloadsPage').then((m) => ({ default: m.DownloadsPage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const HelpPage = lazy(() => import('./pages/help/HelpPage').then((m) => ({ default: m.HelpPage })));
const HelpTopicPage = lazy(() => import('./pages/help/HelpTopicPage').then((m) => ({ default: m.HelpTopicPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProjectPage = lazy(() => import('./pages/projects/ProjectPage').then((m) => ({ default: m.ProjectPage })));
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const ArchivePage = lazy(() => import('./pages/ArchivePage').then((m) => ({ default: m.ArchivePage })));
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })));
const AgentsPage = lazy(() => import('./pages/agents/AgentsPage').then((m) => ({ default: m.AgentsPage })));
const AgentToolsPage = lazy(() => import('./pages/agents/AgentToolsPage').then((m) => ({ default: m.AgentToolsPage })));
const AgentCallsPage = lazy(() => import('./pages/agents/AgentCallsPage').then((m) => ({ default: m.AgentCallsPage })));
const BinPage = lazy(() => import('./pages/BinPage').then((m) => ({ default: m.BinPage })));
const AddAssetsPage = lazy(() => import('./pages/pack/AddAssetsPage').then((m) => ({ default: m.AddAssetsPage })));

function Current() {
  const route = useNav((s) => s.route);
  switch (route.to) {
    case 'home':
      return <HomePage />;
    case 'browse':
      return <BrowsePage />;
    case 'pack':
      return <PackPage key={route.id} id={route.id} edit={route.edit ?? false} />;
    case 'addAssets':
      return <AddAssetsPage key={route.id} id={route.id} />;
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
    case 'agents':
      return <AgentsPage />;
    case 'agentTools':
      return <AgentToolsPage />;
    case 'agentCalls':
      return <AgentCallsPage />;
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

/** While a page that is fetched on demand arrives: a beat, not a flash. */
function Loading() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </div>
  );
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
      {/* The page has its own boundary; this one catches the shell around it. */}
      <ErrorBoundary resetKey="shell" page="the window">
        <Screen />
      </ErrorBoundary>
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
  // Pages that take their own drops: Downloads (links), a pack and its add page (files into it).
  const where = useNav((s) => s.route.to);
  const ownDrop = where === 'downloads' || where === 'pack' || where === 'addAssets';
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
          <Suspense fallback={<Loading />}>
            <Current />
          </Suspense>
        </RoutedBoundary>
      </AppShell>
      <AddMenu anchor={addAnchor} onClose={() => setAddAnchor(null)} />
      <CopyConfirm />
      <MenuCommands />
      <DropOverlay enabled={!ownDrop} />
    </>
  );
}
