import Add from '@mui/icons-material/Add';
import Archive from '@mui/icons-material/Archive';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import Delete from '@mui/icons-material/Delete';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import CollectionsBookmark from '@mui/icons-material/CollectionsBookmark';
import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
import Download from '@mui/icons-material/Download';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import GridView from '@mui/icons-material/GridView';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import Home from '@mui/icons-material/Home';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import RateReview from '@mui/icons-material/RateReview';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import Info from '@mui/icons-material/Info';
import Settings from '@mui/icons-material/Settings';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SportsEsports from '@mui/icons-material/SportsEsports';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import Badge from '@mui/material/Badge';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ComponentType } from 'react';
import { railOf, useNav, type Destination } from '../state/nav';
import { md, mdAlpha, SHAPE, STATE } from '../theme';

interface Item {
  to: Destination;
  label: string;
  icon: ComponentType;
  activeIcon: ComponentType;
}

const MAIN: Item[] = [
  { to: 'home', label: 'Home', icon: HomeOutlined, activeIcon: Home },
  { to: 'browse', label: 'Browse', icon: GridViewOutlined, activeIcon: GridView },
  { to: 'collections', label: 'Collections', icon: CollectionsBookmarkOutlined, activeIcon: CollectionsBookmark },
  { to: 'projects', label: 'Projects', icon: SportsEsportsOutlined, activeIcon: SportsEsports },
  { to: 'inbox', label: 'Review', icon: RateReviewOutlined, activeIcon: RateReview },
  { to: 'downloads', label: 'Downloads', icon: DownloadOutlined, activeIcon: Download },
  { to: 'archive', label: 'Put away', icon: ArchiveOutlined, activeIcon: Archive },
  { to: 'bin', label: 'Bin', icon: DeleteOutlined, activeIcon: Delete },
];
const BOTTOM: Item[] = [
  { to: 'about', label: 'About', icon: InfoOutlined, activeIcon: Info },
  { to: 'settings', label: 'Settings', icon: SettingsOutlined, activeIcon: Settings },
];

export const RAIL_WIDTH = 88;

function RailItem({ item, badge }: { item: Item; badge?: number }) {
  const active = useNav((s) => railOf(s.route) === item.to);
  const go = useNav((s) => s.go);
  const Icon = active ? item.activeIcon : item.icon;
  return (
    <ButtonBase
      disableRipple
      onClick={() => go({ to: item.to })}
      aria-current={active ? 'page' : undefined}
      sx={{
        flexDirection: 'column',
        gap: '4px',
        width: RAIL_WIDTH,
        py: '4px',
        color: active ? md('onSurface') : md('onSurfaceVariant'),
        '& .indicator': {
          width: 56,
          height: 32,
          borderRadius: SHAPE.full,
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
          backgroundColor: active ? md('secondaryContainer') : 'transparent',
          color: active ? md('onSecondaryContainer') : md('onSurfaceVariant'),
          transition: 'background-color 150ms',
        },
        '& .indicator::after': { content: '""', position: 'absolute', inset: 0, borderRadius: `${SHAPE.full}px`, backgroundColor: md('onSurface'), opacity: 0, transition: 'opacity 150ms' },
        '&:hover .indicator::after': { opacity: STATE.hover },
        '&:active .indicator::after': { opacity: STATE.pressed },
        '&.Mui-focusVisible .indicator': { outline: `2px solid ${md('secondary')}`, outlineOffset: 2 },
      }}
    >
      <span className="indicator">
        <Badge badgeContent={badge} color="error" max={99} invisible={!badge}>
          <Icon />
        </Badge>
      </span>
      <Typography variant="labelMedium" sx={{ fontWeight: active ? 700 : 500 }}>
        {item.label}
      </Typography>
    </ButtonBase>
  );
}

export function NavigationRail({ inboxCount, downloadCount, onAdd }: { inboxCount?: number; downloadCount?: number; onAdd: (anchor: HTMLElement) => void }) {
  return (
    <nav
      aria-label="Main"
      style={{ width: RAIL_WIDTH, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 4, paddingBottom: 16 }}
    >
      <Tooltip title="Add packs" placement="right">
        <ButtonBase
          onClick={(e) => onAdd(e.currentTarget)}
          aria-label="Add packs"
          sx={{
            width: 56,
            height: 56,
            mb: 1.5,
            borderRadius: `${SHAPE.lg}px`,
            backgroundColor: md('primaryContainer'),
            color: md('onPrimaryContainer'),
            boxShadow: `0 1px 3px ${mdAlpha('shadow', 0.3)}`,
            transition: 'box-shadow 150ms',
            '&:hover': { boxShadow: `0 2px 6px ${mdAlpha('shadow', 0.35)}` },
          }}
        >
          <Add />
        </ButtonBase>
      </Tooltip>
      {MAIN.map((item) => (
        <RailItem key={item.to} item={item} {...(item.to === 'inbox' && inboxCount ? { badge: inboxCount } : item.to === 'downloads' && downloadCount ? { badge: downloadCount } : {})} />
      ))}
      <div style={{ flex: 1 }} />
      {BOTTOM.map((item) => (
        <RailItem key={item.to} item={item} />
      ))}
    </nav>
  );
}
