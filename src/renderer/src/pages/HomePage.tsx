import AddRounded from '@mui/icons-material/AddRounded';
import ArrowForward from '@mui/icons-material/ArrowForward';
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
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ComponentType, type ReactNode } from 'react';
import { ASSET_TYPES, TYPE_LABELS, type AssetType } from '@shared/assets';
import type { ActivityKind } from '@shared/types';
import { call, on } from '../api';
import { formatBytes, formatCount, TYPE_ICONS } from '../components/labels';
import { LicenceChip } from '../components/LicenceChip';
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
const ACTIVITY_ICONS: Record<ActivityKind, ComponentType<{ sx?: object }>> = {
  added: AddRounded,
  downloaded: DownloadOutlined,
  reviewed: RateReviewOutlined,
  backup: BackupOutlined,
  sync: SyncOutlined,
  project: SportsEsportsOutlined,
  library: AutoStoriesOutlined,
};

/** When something happened, in words. */
function ago(iso: string): string {
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
  const entries = useQuery({ queryKey: ['activity'], queryFn: () => call('activity:list', 12), staleTime: 0 }).data ?? [];
  if (!entries.length) return null;
  return (
    <Section title="What’s been happening">
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
  const projects = useProjects().data ?? [];
  const collections = useCollections().data ?? [];
  const name = state?.status === 'ready' ? state.library.name : '';

  if (stats && stats.packs === 0 && stats.inbox === 0) return <EmptyHome />;

  const types = ASSET_TYPES.filter((t) => t !== 'other' && (stats?.byType[t] ?? 0) > 0);
  const attention = (stats?.inbox ?? 0) + (health?.noCreditLine.length ?? 0) + (health?.restricted.length ?? 0);

  return (
    <Page title={name} subtitle={
        stats
          ? `${formatCount(stats.packs)} pack${stats.packs === 1 ? '' : 's'} · ${formatCount(stats.assets)} asset${stats.assets === 1 ? '' : 's'} · ${formatBytes(stats.size)}${stats.archived ? ` · ${formatCount(stats.archived)} archived` : ''}`
          : undefined
      } width={1240}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36, paddingTop: 8 }}>

        {types.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
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

        {attention > 0 ? (
          <Section title="Needs you">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(stats?.inbox ?? 0) > 0 && (
                <ButtonBase onClick={() => go({ to: 'inbox' })} sx={{ justifyContent: 'flex-start', gap: 2, p: 2, borderRadius: `${SHAPE.md}px`, backgroundColor: md('tertiaryContainer'), color: md('onTertiaryContainer') }}>
                  <InboxOutlined />
                  <Typography variant="bodyLarge" sx={{ flex: 1, textAlign: 'left' }}>
                    {stats!.inbox} pack{stats!.inbox === 1 ? '' : 's'} waiting in Review for a licence or source
                  </Typography>
                  <ArrowForward />
                </ButtonBase>
              )}
              {[...(health?.restricted ?? []).map((p) => ({ ...p, why: 'isn’t allowed in commercial games' })), ...(health?.noCreditLine ?? []).map((p) => ({ ...p, why: 'needs a credit line' }))].map((p) => (
                <ButtonBase key={p.id + p.why} onClick={() => go({ to: 'pack', id: p.id })} sx={{ justifyContent: 'flex-start', gap: 2, px: 2, py: 1.25, borderRadius: `${SHAPE.md}px`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainer') } }}>
                  <WarningAmberOutlined sx={{ color: md('error') }} />
                  <Typography variant="bodyMedium" sx={{ flex: 1, textAlign: 'left', color: md('onSurface') }}>
                    <b>{p.name}</b> {p.why}
                  </Typography>
                  <LicenceChip id={p.licence} />
                </ButtonBase>
              ))}
            </div>
          </Section>
        ) : (
          stats && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: md('onSurfaceVariant') }}>
              <CheckCircleOutlined sx={{ color: md('primary') }} />
              <Typography variant="bodyMedium">Every pack has its licence and source on record.</Typography>
            </div>
          )
        )}

        {recent && recent.length > 0 && (
          <Section title="Recently added" action={<SeeAll onClick={() => (useBrowse.getState().setMode('packs'), useBrowse.getState().setPackSort('added'), go({ to: 'browse' }))} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16 }}>
              {recent.map((p) => (
                <PackCard key={p.id} pack={p} width={200} selected={false} onClick={() => go({ to: 'pack', id: p.id })} onOpen={() => go({ to: 'pack', id: p.id })} />
              ))}
            </div>
          </Section>
        )}

        {projects.length > 0 && (
          <Section title="Projects" action={<SeeAll onClick={() => go({ to: 'projects' })} />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {projects.slice(0, 6).map((p) => (
                <ButtonBase key={p.id} onClick={() => go({ to: 'project', id: p.id })} sx={{ justifyContent: 'flex-start', gap: 2, p: 1.5, borderRadius: `${SHAPE.lg}px`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainer') } }}>
                  <EngineBadge engine={p.engine} />
                  <span style={{ textAlign: 'left', minWidth: 0 }}>
                    <Typography variant="titleSmall" noWrap component="div" sx={{ color: md('onSurface') }}>
                      {p.name}
                    </Typography>
                    <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                      {p.assets} asset{p.assets === 1 ? '' : 's'} copied
                    </Typography>
                  </span>
                </ButtonBase>
              ))}
            </div>
          </Section>
        )}

        {collections.length > 0 && (
          <Section title="Collections" action={<SeeAll onClick={() => go({ to: 'collections' })} />}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {collections.slice(0, 12).map((c) => (
                <Button key={c.id} variant="outlined" onClick={() => go({ to: 'collection', id: c.id })}>
                  {c.name} · {c.count}
                </Button>
              ))}
            </div>
          </Section>
        )}

        <Happening />
      </div>
    </Page>
  );
}
