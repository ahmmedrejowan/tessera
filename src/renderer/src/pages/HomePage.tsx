import AddOutlined from '@mui/icons-material/AddOutlined';
import ArrowForward from '@mui/icons-material/ArrowForward';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ASSET_TYPES, TYPE_LABELS, type AssetType } from '@shared/assets';
import { call } from '../api';
import { formatBytes, formatCount, TYPE_ICONS } from '../components/labels';
import { LicenceChip } from '../components/LicenceChip';
import { useBrowse } from '../state/browse';
import { useCollections } from '../state/collections';
import { useImport } from '../state/importer';
import { useIndexVersion, useLibraryId, useLibraryState, useStats } from '../state/library';
import { useNav } from '../state/nav';
import { useProjects } from '../state/projects';
import { md, SHAPE, STATE } from '../theme';
import { PackCard } from './browse/PackCard';
import { EngineBadge } from './projects/EngineBadge';

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

/** The first screen with a library open: what's in it, what needs you, and what you worked on. */
export function HomePage() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const state = useLibraryState().data;
  const stats = useStats().data;
  const go = useNav((s) => s.go);
  const choose = useImport((s) => s.choose);
  const health = useQuery({ queryKey: ['health', lib, version], queryFn: () => call('library:health'), enabled: !!lib }).data;
  const recent = useQuery({
    queryKey: ['recent-packs', lib, version],
    queryFn: () => call('browse:packs', { scope: 'library', text: '', filters: {} }, 'added', 0, 6),
    enabled: !!lib,
  }).data?.rows;
  const projects = useProjects().data ?? [];
  const collections = useCollections().data ?? [];
  const name = state?.status === 'ready' ? state.library.name : '';

  if (stats && stats.packs === 0 && stats.inbox === 0) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 32 }}>
        <div style={{ maxWidth: 560, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 32px', borderRadius: SHAPE.xl, border: `2px dashed ${md('outlineVariant')}` }}>
          <FileDownloadOutlined sx={{ fontSize: 56, color: md('primary') }} />
          <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
            Drop your asset packs here
          </Typography>
          <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant') }}>
            Zips from Kenney, itch.io or anywhere, folders, or loose files. Each is kept exactly as downloaded, with its licence and source on record. Packs that state their licence go straight in; the rest wait in the Inbox for you to check.
          </Typography>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => void choose('files')}>
              Add downloads
            </Button>
            <Button variant="outlined" onClick={() => void choose('folderOfPacks')}>
              Add a folder of packs
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const types = ASSET_TYPES.filter((t) => t !== 'other' && (stats?.byType[t] ?? 0) > 0);
  const attention = (stats?.inbox ?? 0) + (health?.noCreditLine.length ?? 0) + (health?.restricted.length ?? 0);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 32px 48px', display: 'flex', flexDirection: 'column', gap: 36 }}>
        <div>
          <Typography variant="headlineMedium" component="h1" sx={{ color: md('onSurface') }}>
            {name}
          </Typography>
          {stats && (
            <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
              {formatCount(stats.packs)} packs · {formatCount(stats.assets)} assets · {formatBytes(stats.size)}
            </Typography>
          )}
        </div>

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
                    {stats!.inbox} pack{stats!.inbox === 1 ? '' : 's'} waiting in the Inbox for a licence or source
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
      </div>
    </div>
  );
}
