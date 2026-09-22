import HomeOutlined from '@mui/icons-material/HomeOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import { useState } from 'react';
import { EmptyState } from './components/EmptyState';
import { ToastHost } from './components/Toast';
import { AddMenu } from './import/AddMenu';
import { DropOverlay } from './import/DropOverlay';
import { ImportDialog } from './import/ImportDialog';
import { BrowsePage } from './pages/browse/BrowsePage';
import { CollectionPage } from './pages/collections/CollectionPage';
import { CollectionsPage } from './pages/collections/CollectionsPage';
import { InboxPage } from './pages/InboxPage';
import { PackPage } from './pages/pack/PackPage';
import { Page } from './pages/Placeholder';
import { Welcome } from './pages/Welcome';
import { AppShell } from './shell/AppShell';
import { useLibraryState, useStats } from './state/library';
import { useNav } from './state/nav';

const PLACEHOLDERS = {
  home: { title: 'Home', icon: HomeOutlined },
  projects: { title: 'Projects', icon: SportsEsportsOutlined },
  settings: { title: 'Settings', icon: SettingsOutlined },
};

function Current() {
  const route = useNav((s) => s.route);
  if (route.to === 'browse') return <BrowsePage />;
  if (route.to === 'pack') return <PackPage key={route.id} id={route.id} />;
  if (route.to === 'inbox') return <InboxPage />;
  if (route.to === 'collections') return <CollectionsPage />;
  if (route.to === 'collection') return <CollectionPage key={route.id} id={route.id} />;
  const p = PLACEHOLDERS[route.to];
  return (
    <Page title={p.title}>
      <EmptyState icon={p.icon} title={`${p.title} is on its way`} body="This part of Tessera hasn't been built yet." />
    </Page>
  );
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
        <Current />
      </AppShell>
      <AddMenu anchor={addAnchor} onClose={() => setAddAnchor(null)} />
      <ImportDialog />
      <DropOverlay enabled />
      <ToastHost />
    </>
  );
}
