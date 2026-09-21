import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import { EmptyState } from './components/EmptyState';
import { BrowsePage } from './pages/browse/BrowsePage';
import { Page } from './pages/Placeholder';
import { Welcome } from './pages/Welcome';
import { AppShell } from './shell/AppShell';
import { useLibraryState, useStats } from './state/library';
import { useNav } from './state/nav';

const PLACEHOLDERS = {
  home: { title: 'Home', icon: HomeOutlined },
  collections: { title: 'Collections', icon: CollectionsBookmarkOutlined },
  projects: { title: 'Projects', icon: SportsEsportsOutlined },
  inbox: { title: 'Inbox', icon: InboxOutlined },
  settings: { title: 'Settings', icon: SettingsOutlined },
};

function Current() {
  const route = useNav((s) => s.route);
  if (route.to === 'browse') return <BrowsePage />;
  if (route.to === 'pack') return <Page title="Pack">{null}</Page>;
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
    <AppShell onAdd={() => undefined} {...(inbox ? { inboxCount: inbox } : {})}>
      <Current />
    </AppShell>
  );
}
