import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import { EmptyState } from './components/EmptyState';
import { Page } from './pages/Placeholder';
import { AppShell } from './shell/AppShell';
import { useNav, type Destination } from './state/nav';

const TITLES: Record<Destination, string> = {
  home: 'Home',
  browse: 'Browse',
  collections: 'Collections',
  projects: 'Projects',
  inbox: 'Inbox',
  settings: 'Settings',
};
const ICONS = {
  home: HomeOutlined,
  browse: GridViewOutlined,
  collections: CollectionsBookmarkOutlined,
  projects: SportsEsportsOutlined,
  inbox: InboxOutlined,
  settings: SettingsOutlined,
};

export function App() {
  const route = useNav((s) => s.route);
  return (
    <AppShell onAdd={() => undefined}>
      <Page title={TITLES[route.to]}>
        <EmptyState icon={ICONS[route.to]} title={`${TITLES[route.to]} is on its way`} body="This part of Tessera hasn't been built yet." />
      </Page>
    </AppShell>
  );
}
