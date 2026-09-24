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
import { LicenceChip } from '../components/LicenceChip';
import { FAVOURITES } from '@shared/collection';
import { AgentCard } from './agents/AgentCard';
import { PackMenu } from './browse/TileMenu';
import { CollectionIcon, ReviewIcon } from '../components/icons';
import type { PackRow } from '@shared/query';
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), color: md('onSurfaceVariant') }}>
        <CheckCircleOutlined sx={{ color: md('primary'), flexShrink: 0 }} />
        <Typography variant="bodyMedium">Every pack has its licence and source on record.</Typography>
      </div>
    ) : null;
  }
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Typography variant="titleMedium" component="h2" sx={{ color: md('onSurface') }}>
          Needs you
        </Typography>
        {inbox > 0 && <SeeAll onClick={() => go({ to: 'inbox' })} />}
      </div>
      {inbox > 0 && (
        <ButtonBase onClick={() => go({ to: 'inbox' })} sx={{ justifyContent: 'flex-start', gap: 1.5, p: 2, borderRadius: `${SHAPE.md}px`, backgroundColor: md('tertiaryContainer'), color: md('onTertiaryContainer') }}>
          <ReviewIcon sx={{ flexShrink: 0 }} />
          <Typography variant="bodyMedium" sx={{ flex: 1, textAlign: 'left' }}>
            {inbox} pack{inbox === 1 ? '' : 's'} waiting in Review for a licence or a source
          </Typography>
          <ArrowForward sx={{ flexShrink: 0 }} />
        </ButtonBase>
      )}
      {watching.slice(0, 6).map((p) => (
        <ButtonBase
          key={p.id + p.why}
          onClick={() => go({ to: 'pack', id: p.id })}
          sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, borderRadius: `${SHAPE.md}px`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainer') } }}
        >
          <WarningAmberOutlined sx={{ color: md('error'), fontSize: 20, flexShrink: 0, mt: 0.25 }} />
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface') }}>
              <b>{p.name}</b> {p.why}
            </Typography>
            <span style={{ display: 'inline-flex', marginTop: 6 }}>
              <LicenceChip id={p.licence} />
            </span>
          </span>
        </ButtonBase>
      ))}
    </section>
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

/** Open a starred asset where it lives: its pack's page. */
function openStarred(asset: { packId: string }) {
  useNav.getState().go({ to: 'pack', id: asset.packId });
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
  const starredAssets = useQuery({
    queryKey: ['starred-assets', lib, version],
    queryFn: () => call('browse:assets', { scope: 'library', text: '', filters: {}, favourites: true }, 'name', 0, 12),
    enabled: !!lib,
  }).data;
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 240px))', gap: 12, justifyContent: 'start' }}>
            {types.map((t) => {
              const Icon = TYPE_ICONS[t];
              return (
                <ButtonBase
                  key={t}
                  onClick={() => browseType(t)}
                  sx={{
                    justifyContent: 'flex-start',
                    gap: 1.5,
                    p: 2,
                    borderRadius: `${SHAPE.lg}px`,
                    backgroundColor: md('surfaceContainerLow'),
                    '&:hover': { backgroundColor: md('surfaceContainer') },
                    '&:active': { opacity: 1 - STATE.pressed },
                  }}
                >
                  <span style={{ width: 40, height: 40, borderRadius: SHAPE.md, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer') }}>
                    <Icon />
                  </span>
                  <span style={{ textAlign: 'left' }}>
                    <Typography variant="titleMedium" component="div" sx={{ color: md('onSurface') }}>
                      {formatCount(stats?.byType[t] ?? 0)}
                    </Typography>
                    <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                      {TYPE_LABELS[t]}
                    </Typography>
                  </span>
                </ButtonBase>
              );
            })}
          </div>
        )}

        {starredPacks.length > 0 && (
          <Section title="Starred" action={<SeeAll onClick={() => go({ to: 'collection', id: FAVOURITES })} />}>
            <Row>
              {starredPacks.map((p) => (
                <div key={p.id} style={{ width: 200, flexShrink: 0 }}>
                  <PackCard pack={p} width={200} selected={false} onClick={() => go({ to: 'pack', id: p.id })} onOpen={() => go({ to: 'pack', id: p.id })} onMenu={(anchor, x) => setPackMenu({ anchor, pack: x })} />
                </div>
              ))}
            </Row>
          </Section>
        )}

        {recent && recent.length > 0 && (
          <Section title="Recently added" action={<SeeAll onClick={() => (useBrowse.getState().setMode('packs'), useBrowse.getState().setPackSort('added'), go({ to: 'browse' }))} />}>
            <Row>
              {recent.map((p) => (
                <div key={p.id} style={{ width: 200, flexShrink: 0 }}>
                  <PackCard pack={p} width={200} selected={false} onClick={() => go({ to: 'pack', id: p.id })} onOpen={() => go({ to: 'pack', id: p.id })} onMenu={(anchor, x) => setPackMenu({ anchor, pack: x })} />
                </div>
              ))}
            </Row>
          </Section>
        )}

        {collections.length > 0 && (
          <Section title="Collections" action={<SeeAll onClick={() => go({ to: 'collections' })} />}>
            <Row>
              {collections.slice(0, 12).map((c) => (
                <ButtonBase
                  key={c.id}
                  onClick={() => go({ to: 'collection', id: c.id })}
                  sx={{ flexShrink: 0, width: 200, justifyContent: 'flex-start', gap: 1.5, p: 1.5, borderRadius: `${SHAPE.lg}px`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainer') } }}
                >
                  <span style={{ width: 40, height: 40, borderRadius: SHAPE.md, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer'), flexShrink: 0 }}>
                    <CollectionIcon />
                  </span>
                  <span style={{ textAlign: 'left', minWidth: 0 }}>
                    <Typography variant="titleSmall" noWrap component="div" sx={{ color: md('onSurface') }}>
                      {c.name}
                    </Typography>
                    <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
                      {formatCount(c.assets)} asset{c.assets === 1 ? '' : 's'}
                    </Typography>
                  </span>
                </ButtonBase>
              ))}
            </Row>
          </Section>
        )}

        {projects.length > 0 && (
          <Section title="Games" action={<SeeAll onClick={() => go({ to: 'projects' })} />}>
            <Row>
              {projects.slice(0, 8).map((p) => (
                <ButtonBase key={p.id} onClick={() => go({ to: 'project', id: p.id })} sx={{ flexShrink: 0, width: 260, justifyContent: 'flex-start', gap: 2, p: 1.5, borderRadius: `${SHAPE.lg}px`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainer') } }}>
                  <EngineBadge engine={p.engine} />
                  <span style={{ textAlign: 'left', minWidth: 0 }}>
                    <Typography variant="titleSmall" noWrap component="div" sx={{ color: md('onSurface') }}>
                      {p.name}
                    </Typography>
                    <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                      {p.assets} asset{p.assets === 1 ? '' : 's'} linked
                    </Typography>
                  </span>
                </ButtonBase>
              ))}
            </Row>
          </Section>
        )}

        <Happening />
      </div>

      {/* What needs you, and who else is working here: the same column, whatever the library holds. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, order: -1, '@media (min-width: 1240px)': { order: 0, position: 'sticky', top: 0 } }}>
        <Watcher inbox={stats?.inbox ?? 0} watching={watching} ready={!!stats} />
        <AgentCard />
      </Box>
      </Box>
      {packMenu && <PackMenu anchor={packMenu.anchor} pack={packMenu.pack} onClose={() => setPackMenu(null)} onOpen={() => go({ to: 'pack', id: packMenu.pack.id })} />}
    </Page>
  );
}
