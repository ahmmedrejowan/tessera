import AddRounded from '@mui/icons-material/AddRounded';
import ArrowForward from '@mui/icons-material/ArrowForward';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import BackupOutlined from '@mui/icons-material/BackupOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, type ComponentType, type ReactNode } from 'react';
import { ASSET_TYPES, TYPE_LABELS, type AssetType } from '@shared/assets';
import type { ActivityKind } from '@shared/types';
import { call, on } from '../api';
import { formatBytes, formatCount, TYPE_ICONS } from '../components/labels';
import { SideBlock } from '../components/SideBlock';
import { FAVOURITES } from '@shared/collection';
import { AgentCard } from './agents/AgentCard';
import { AgentHistory } from './agents/AgentHistory';
import { CollectionCard } from './collections/CollectionsPage';
import { PackMenu } from './browse/TileMenu';
import { CollectionIcon, ReviewIcon } from '../components/icons';
import type { PackRow } from '@shared/query';
import type { Engine } from '@shared/project';
import { useBrowse } from '../state/browse';
import { useCollections } from '../state/collections';
import { useImport } from '../state/importer';
import { useIndexVersion, useLibraryId, useLibraryState, useStats } from '../state/library';
import { useNav } from '../state/nav';
import { useProjects } from '../state/projects';
import { md, mdAlpha, SHAPE, STATE } from '../theme';
import { Page } from './Placeholder';
import { PackCard } from './browse/PackCard';
import { EngineBadge } from './projects/EngineBadge';
import { useLinkProject } from './projects/ProjectsPage';


/** Icons for the kinds of thing that happen in a library. */
export const ACTIVITY_ICONS: Record<ActivityKind, ComponentType<{ sx?: object }>> = {
  added: AddRounded,
  downloaded: DownloadOutlined,
  reviewed: RateReviewOutlined,
  backup: BackupOutlined,
  sync: SyncOutlined,
  project: SportsEsportsOutlined,
  library: AutoStoriesOutlined,
  agent: SmartToyOutlined,
};

/** When something happened, in words. */
export function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString();
}

/** What has been happening in this library: added, downloaded, reviewed, backed up, copied. */
function Happening() {
  const client = useQueryClient();
  useEffect(() => on('activity:changed', () => void client.invalidateQueries({ queryKey: ['activity'] })), [client]);
  // Things happen while another page is open, so this is read again whenever Home comes back.
  const entries = (useQuery({ queryKey: ['activity'], queryFn: () => call('activity:list', 12), staleTime: 0 }).data ?? []).slice(0, 3);
  const go = useNav((s) => s.go);
  if (!entries.length) return null;
  return (
    <Section title="Activity" action={<SeeAll onClick={() => go({ to: 'activity' })} />}>
      <div style={{ borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), padding: '4px 20px' }}>
        {entries.map((e, i) => {
          const Icon = ACTIVITY_ICONS[e.kind] ?? AddRounded;
          return (
            <div key={`${e.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? `1px solid ${md('outlineVariant')}` : 'none' }}>
              <Icon sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface') }}>
                  {e.text}
                </Typography>
                {e.detail && (
                  <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
                    {e.detail}
                  </Typography>
                )}
              </div>
              <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), flexShrink: 0 }}>
                {ago(e.at)}
              </Typography>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/**
 * What needs you: packs waiting in Review, and packs missing a licence, a source or a credit line.
 * It sits in Home's side column, so each line stacks rather than running along a row.
 */
function Watcher({ inbox, watching, ready }: { inbox: number; watching: { id: string; name: string; why: string; licence: string | null }[]; ready: boolean }) {
  const go = useNav((s) => s.go);
  if (!inbox && !watching.length) {
    return ready ? (
      <SideBlock title="Watcher">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
          <CheckCircleOutlined sx={{ fontSize: 20, color: md('onSurfaceVariant'), flexShrink: 0 }} />
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
            Every pack has its licence and source on record.
          </Typography>
        </div>
      </SideBlock>
    ) : null;
  }
  const total = inbox + watching.length;
  return (
    <SideBlock title="Watcher" note={`${total} ${total === 1 ? 'thing' : 'things'} to see to`} action={inbox > 0 ? <SeeAll onClick={() => go({ to: 'inbox' })} /> : undefined}>
      <div style={{ padding: '2px 14px' }}>
        {inbox > 0 && (
          <ButtonBase onClick={() => go({ to: 'inbox' })} sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.25, py: 1.25, textAlign: 'left' }}>
            <ReviewIcon sx={{ fontSize: 20, color: md('onSurfaceVariant'), flexShrink: 0 }} />
            <Typography variant="bodySmall" sx={{ flex: 1, color: md('onSurface') }}>
              {inbox} pack{inbox === 1 ? '' : 's'} waiting in Review
            </Typography>
            <ArrowForward sx={{ fontSize: 16, color: md('onSurfaceVariant'), flexShrink: 0 }} />
          </ButtonBase>
        )}
        {watching.slice(0, 5).map((p, i) => (
          <ButtonBase
            key={p.id + p.why}
            onClick={() => go({ to: 'pack', id: p.id })}
            sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.25, py: 1.25, textAlign: 'left', borderTop: i || inbox ? `1px solid ${md('outlineVariant')}` : 'none' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 3, background: md('outline'), flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurface') }}>
                {p.name}
              </Typography>
              <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
                {p.why}
              </Typography>
            </span>
          </ButtonBase>
        ))}
        {watching.length > 5 && (
          <Typography variant="bodySmall" sx={{ display: 'block', py: 1.25, color: md('onSurfaceVariant') }}>
            and {watching.length - 5} more
          </Typography>
        )}
      </div>
    </SideBlock>
  );
}

/** Every card in Home's rows is this wide, whatever it holds: packs, collections, games. */
const CARD_WIDTH = 210;
const CARD: React.CSSProperties = { width: CARD_WIDTH, flexShrink: 0 };

/**
 * One kind of asset in this library: how many, what share of the whole, and a way into Browse
 * with that filter on. Together they say what the library is made of at a glance.
 */
function KindTile({ type, count, of }: { type: AssetType; count: number; of: number }) {
  const Icon = TYPE_ICONS[type];
  const share = of ? count / of : 0;
  return (
    <ButtonBase
      onClick={() => browseType(type)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 1,
        p: 2,
        borderRadius: `${SHAPE.lg}px`,
        backgroundColor: md('surfaceContainerLow'),
        '&:hover': { backgroundColor: md('surfaceContainer') },
        '&:active': { opacity: 1 - STATE.pressed },
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 32, height: 32, borderRadius: SHAPE.sm, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer'), flexShrink: 0 }}>
          <Icon sx={{ fontSize: 19 }} />
        </span>
        <Typography variant="bodySmall" sx={{ flex: 1, textAlign: 'right', color: md('onSurfaceVariant') }}>
          {share >= 0.005 ? `${Math.round(share * 100)}%` : '<1%'}
        </Typography>
      </span>
      <span style={{ textAlign: 'left' }}>
        <Typography variant="headlineSmall" component="div" sx={{ color: md('onSurface'), lineHeight: 1.15 }}>
          {formatCount(count)}
        </Typography>
        <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
          {TYPE_LABELS[type]}
        </Typography>
      </span>
      {/* The share of the library this kind is, drawn rather than said twice. */}
      <span style={{ height: 4, borderRadius: 2, background: mdAlpha('onSurface', 0.08), overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.max(share * 100, 2)}%`, background: md('primary'), borderRadius: 2 }} />
      </span>
    </ButtonBase>
  );
}

/** A game, as a card the same shape as a pack's: where assets are linked to. */
function GameCard({ project }: { project: { id: string; name: string; engine: Engine; assets: number; packs: number } }) {
  const go = useNav((s) => s.go);
  return (
    <ButtonBase
      onClick={() => go({ to: 'project', id: project.id })}
      sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1, borderRadius: `${SHAPE.lg}px`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainer') } }}
    >
      <span style={{ display: 'grid', placeItems: 'center', aspectRatio: '4 / 3', borderRadius: SHAPE.md, background: md('surfaceContainerHigh') }}>
        <EngineBadge engine={project.engine} />
      </span>
      <span style={{ display: 'block', padding: '10px 6px 4px' }}>
        <Typography variant="titleSmall" noWrap component="div" sx={{ color: md('onSurface') }}>
          {project.name}
        </Typography>
        <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
          {formatCount(project.assets)} asset{project.assets === 1 ? '' : 's'} linked
        </Typography>
      </span>
    </ButtonBase>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="titleLarge" component="h2" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A row of cards that runs off the side rather than wrapping: Home stays one screen deep. */
function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, scrollbarWidth: 'thin' }}>{children}</div>
  );
}

function SeeAll({ onClick }: { onClick: () => void }) {
  return (
    <Button endIcon={<ArrowForward />} onClick={onClick}>
      See all
    </Button>
  );
}

/** Browse with one type filter on. */
function browseType(type: AssetType) {
  const s = useBrowse.getState();
  s.setMode('assets');
  s.clearFilters();
  s.setText('');
  s.setFilter('type', [type]);
  useNav.getState().go({ to: 'browse' });
}

/** One step of getting started: a tick, what it is, and a way to do it (gone once it's done). */
function Step({ done, label, action, onClick, busy }: { done: boolean; label: string; action: string; onClick: () => void; busy?: boolean }) {
  return (
    <ButtonBase
      disabled={done || !!busy}
      onClick={onClick}
      sx={{ width: '100%', height: 52, gap: 1.75, px: 2, borderRadius: `${SHAPE.lg}px`, justifyContent: 'flex-start', textAlign: 'left', '&:hover': { backgroundColor: md('surfaceContainerLow') } }}
    >
      {done ? (
        <CheckCircleRounded sx={{ fontSize: 26, color: md('primary') }} />
      ) : (
        <span style={{ width: 22, height: 22, margin: 2, borderRadius: '50%', border: `2px solid ${md('outline')}`, flexShrink: 0 }} />
      )}
      <Typography variant="bodyLarge" sx={{ flex: 1, color: done ? md('onSurfaceVariant') : md('onSurface'), textDecoration: done ? 'line-through' : 'none' }}>
        {label}
      </Typography>
      <Typography variant="labelLarge" sx={{ color: md('primary'), visibility: done ? 'hidden' : 'visible' }}>
        {busy ? 'Adding…' : action}
      </Typography>
    </ButtonBase>
  );
}

/**
 * Home for a library with nothing in it yet: drag packs in or choose them, and a few first steps
 * that tick themselves off. The first pack turns it into the full Home.
 */
function EmptyHome() {
  const choose = useImport((s) => s.choose);
  const addingSamples = useImport((s) => s.planning || s.running);
  const projects = useProjects().data ?? [];
  const backup = useQuery({ queryKey: ['backup'], queryFn: () => call('backup:status'), staleTime: 0 }).data;
  const link = useLinkProject();
  const go = useNav((s) => s.go);
  const steps = [
    { label: 'Add your first pack', action: 'Choose files', done: false, onClick: () => void choose('files') },
    { label: 'Or look around with a sample pack', action: 'Try it', done: false, busy: addingSamples, onClick: () => void useImport.getState().addSamples() },
    { label: 'Link a game project', action: 'Link', done: projects.length > 0, onClick: () => void link.start() },
    { label: 'Turn on backups', action: 'Set up', done: !!backup?.repoPath, onClick: () => go({ to: 'settings', section: 'backups' }) },
  ];
  const done = steps.filter((x) => x.done).length;
  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'grid', placeItems: 'center', padding: '40px 32px', background: `radial-gradient(38% 34% at 50% 36%, ${mdAlpha('primaryContainer', 0.55)}, transparent 72%)` }}>
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <span style={{ width: 88, height: 88, borderRadius: 28, display: 'grid', placeItems: 'center', background: md('surfaceContainerLowest'), border: `1px solid ${md('outlineVariant')}`, boxShadow: `0 10px 28px ${mdAlpha('primary', 0.1)}`, color: md('primary') }}>
          <FileDownloadOutlined sx={{ fontSize: 40 }} />
        </span>
        <Typography component="h1" sx={{ mt: 3.5, color: md('onSurface'), fontSize: 36, lineHeight: '44px', fontWeight: 500, letterSpacing: '-0.6px' }}>
          Drag your packs in
        </Typography>
        <Typography variant="bodyLarge" sx={{ mt: 1.25, mb: 3.5, color: md('onSurfaceVariant') }}>
          Drop zips, folders or loose files anywhere in this window,
          <br />
          or choose them from your computer.
        </Typography>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="contained" startIcon={<UploadFileOutlined />} onClick={() => void choose('files')} sx={{ height: 56, px: 3.5, fontSize: 16, borderRadius: `${SHAPE.full}px`, boxShadow: `0 8px 22px ${mdAlpha('primary', 0.28)}` }}>
            Choose files
          </Button>
          <Button variant="outlined" startIcon={<FolderOpenOutlined />} onClick={() => void choose('folderOfPacks')} sx={{ height: 56, px: 3.5, fontSize: 16, borderRadius: `${SHAPE.full}px` }}>
            Choose a folder
          </Button>
        </div>

        <div style={{ marginTop: 48, width: '100%', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 16px 6px' }}>
            <Typography variant="titleSmall" sx={{ color: md('onSurface'), flex: 1 }}>
              Get started
            </Typography>
            <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
              {done} of {steps.length} done
            </Typography>
          </div>
          {steps.map((x) => (
            <Step key={x.label} {...x} />
          ))}
        </div>
      </div>
      {link.dialog}
    </div>
  );
}

/** The first screen with a library open: what's in it, what needs you, and what you worked on. */
export function HomePage() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const state = useLibraryState().data;
  const stats = useStats().data;
  const go = useNav((s) => s.go);
  const health = useQuery({ queryKey: ['health', lib, version], queryFn: () => call('library:health'), enabled: !!lib }).data;
  const recent = useQuery({
    queryKey: ['recent-packs', lib, version],
    queryFn: () => call('browse:packs', { scope: 'library', text: '', filters: {} }, 'added', 0, 6),
    enabled: !!lib,
  }).data?.rows;
  // What was starred, first thing: the whole point of a star is that it comes to hand.
  const starredPacks = useQuery({
    queryKey: ['starred-packs', lib, version],
    queryFn: () => call('browse:packs', { scope: 'library', text: '', filters: {}, favourites: true }, 'name', 0, 6),
    enabled: !!lib,
  }).data?.rows ?? [];
  const projects = useProjects().data ?? [];
  const collections = useCollections().data ?? [];
  const [packMenu, setPackMenu] = useState<{ anchor: HTMLElement; pack: PackRow } | null>(null);
  const name = state?.status === 'ready' ? state.library.name : '';

  if (stats && stats.packs === 0 && stats.inbox === 0) return <EmptyHome />;

  const types = ASSET_TYPES.filter((t) => t !== 'other' && (stats?.byType[t] ?? 0) > 0);
  // Only what is actually missing. A licence that forbids selling is a choice, and the game that
  // uses it is where that matters.
  const watching = [
    ...(health?.noLicence ?? []).map((p) => ({ ...p, why: 'has no licence on record' })),
    ...(health?.noSource ?? []).map((p) => ({ ...p, why: 'has nothing on record about where it came from' })),
    ...(health?.noCreditLine ?? []).map((p) => ({ ...p, why: 'needs a credit line' })),
  ];

  return (
    <Page title={name} subtitle={
        stats
          ? `${formatCount(stats.packs)} pack${stats.packs === 1 ? '' : 's'} · ${formatCount(stats.assets)} asset${stats.assets === 1 ? '' : 's'} · ${formatBytes(stats.size)}${stats.archived ? ` · ${formatCount(stats.archived)} archived` : ''}`
          : undefined
      }>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          alignItems: 'start',
          gap: 4,
          pt: 1,
          // Wide enough for both, and the side column stays with you as the library scrolls.
          '@media (min-width: 1240px)': { gridTemplateColumns: 'minmax(0, 1fr) 320px' },
        }}
      >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, minWidth: 0 }}>

        {types.length > 0 && (
          <Section title="Overview" action={<SeeAll onClick={() => go({ to: 'browse' })} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 250px))', gap: 12, justifyContent: 'start' }}>
              {types.map((t) => (
                <KindTile key={t} type={t} count={stats?.byType[t] ?? 0} of={stats?.assets ?? 0} />
              ))}
            </div>
          </Section>
        )}

        {recent && recent.length > 0 && (
          <Section title="Recent" action={<SeeAll onClick={() => (useBrowse.getState().setMode('packs'), useBrowse.getState().setPackSort('added'), go({ to: 'browse' }))} />}>
            <Row>
              {recent.map((p) => (
                <div key={p.id} style={CARD}>
                  <PackCard pack={p} width={CARD_WIDTH} selected={false} onClick={() => go({ to: 'pack', id: p.id })} onOpen={() => go({ to: 'pack', id: p.id })} onMenu={(anchor, x) => setPackMenu({ anchor, pack: x })} />
                </div>
              ))}
            </Row>
          </Section>
        )}

        {/* Starred packs only. A starred file is one of thousands, and belongs in Browse. */}
        {starredPacks.length > 0 && (
          <Section title="Favourite" action={<SeeAll onClick={() => go({ to: 'collection', id: FAVOURITES })} />}>
            <Row>
              {starredPacks.map((p) => (
                <div key={p.id} style={CARD}>
                  <PackCard pack={p} width={CARD_WIDTH} selected={false} onClick={() => go({ to: 'pack', id: p.id })} onOpen={() => go({ to: 'pack', id: p.id })} onMenu={(anchor, x) => setPackMenu({ anchor, pack: x })} />
                </div>
              ))}
            </Row>
          </Section>
        )}

        {collections.length > 0 && (
          <Section title="Collections" action={<SeeAll onClick={() => go({ to: 'collections' })} />}>
            <Row>
              {collections.slice(0, 12).map((c) => (
                <div key={c.id} style={CARD}>
                  <CollectionCard c={c} />
                </div>
              ))}
            </Row>
          </Section>
        )}

        {projects.length > 0 && (
          <Section title="Games" action={<SeeAll onClick={() => go({ to: 'projects' })} />}>
            <Row>
              {projects.slice(0, 8).map((p) => (
                <div key={p.id} style={CARD}>
                  <GameCard project={p} />
                </div>
              ))}
            </Row>
          </Section>
        )}

        <Happening />
      </div>

      {/* What needs you, and who else is working here: the same column, whatever the library holds. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, order: -1, '@media (min-width: 1240px)': { order: 0, position: 'sticky', top: 0 } }}>
        <Watcher inbox={stats?.inbox ?? 0} watching={watching} ready={!!stats} />
        <AgentCard />
        <AgentHistory />
      </Box>
      </Box>
      {packMenu && <PackMenu anchor={packMenu.anchor} pack={packMenu.pack} onClose={() => setPackMenu(null)} onOpen={() => go({ to: 'pack', id: packMenu.pack.id })} />}
    </Page>
  );
}
