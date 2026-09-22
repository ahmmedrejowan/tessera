import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import Button from '@mui/material/Button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ToolName } from '@shared/types';
import { call, on } from '../../api';
import { formatBytes } from '../../components/labels';
import { failed, notify } from '../../notices/store';
import { md } from '../../theme';
import { Row } from './parts';
import { useSyncStatus } from './SyncSettings';

const WHAT: Record<ToolName, { name: string; does: string }> = {
  kopia: { name: 'Kopia', does: 'Makes the encrypted backups.' },
  syncthing: { name: 'Syncthing', does: 'Keeps libraries the same on your other computers.' },
  rclone: { name: 'rclone', does: 'Signs in to cloud drives (Google Drive, OneDrive, Dropbox…) for backups.' },
};

/** The open-source tools Tessera can use: whether each is here, and getting the ones that aren't. */
export function Helpers() {
  const client = useQueryClient();
  const backup = useQuery({ queryKey: ['backup'], queryFn: () => call('backup:status'), staleTime: 0 }).data;
  const sync = useSyncStatus(0).data;
  const [progress, setProgress] = useState<Partial<Record<ToolName, string>>>({});
  useEffect(
    () =>
      on('tools:installProgress', (p) =>
        setProgress((s) => ({ ...s, [p.tool]: p.stage === 'downloading' && p.total ? `${formatBytes(p.received)} of ${formatBytes(p.total)}` : p.stage === 'done' ? '' : `${p.stage[0]!.toUpperCase()}${p.stage.slice(1)}…` })),
      ),
    [],
  );
  if (!backup || !sync) return null;
  const state: Record<ToolName, { here: boolean; detail: string }> = {
    kopia: { here: backup.available, detail: backup.available ? `${backup.version ? `Version ${backup.version}` : 'Installed'}${backup.bundled ? ' · downloaded by Tessera' : ''}` : 'Not here yet' },
    syncthing: { here: sync.available, detail: sync.available ? `Installed${sync.bundled ? ' · downloaded by Tessera' : ''}` : 'Not here yet' },
    rclone: { here: backup.rclone, detail: backup.rclone ? 'Installed' : 'Not here yet · only needed to sign in to a cloud drive directly' },
  };
  const get = async (tool: ToolName) => {
    setProgress((s) => ({ ...s, [tool]: 'Starting…' }));
    try {
      const version = await call('tools:install', tool);
      notify.success(`${WHAT[tool].name} ${version} is ready.`);
      await client.invalidateQueries({ queryKey: ['backup'] });
      await client.invalidateQueries({ queryKey: ['sync'] });
    } catch (e) {
      failed(e, `Couldn’t get ${WHAT[tool].name}`);
    } finally {
      setProgress((s) => ({ ...s, [tool]: '' }));
    }
  };
  return (
    <>
      {(Object.keys(WHAT) as ToolName[]).map((tool) => {
        const busy = progress[tool];
        return (
          <Row
            key={tool}
            title={WHAT[tool].name}
            body={
              <>
                {WHAT[tool].does}
                <span style={{ display: 'block' }}>{busy || state[tool].detail}</span>
              </>
            }
          >
            {state[tool].here ? (
              <CheckCircleOutlined sx={{ color: md('primary') }} titleAccess="Installed" />
            ) : (
              <Button variant="outlined" disabled={!!busy} onClick={() => void get(tool)}>
                {busy ? 'Getting…' : 'Download'}
              </Button>
            )}
          </Row>
        );
      })}
    </>
  );
}
