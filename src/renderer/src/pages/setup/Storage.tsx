import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CloudOutlined from '@mui/icons-material/CloudOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import FolderRounded from '@mui/icons-material/FolderRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import UsbRounded from '@mui/icons-material/UsbRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Switch from '@mui/material/Switch';
import ButtonBase from '@mui/material/ButtonBase';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ComponentType } from 'react';
import type { BackupPlace } from '@shared/types';
import { GROUPS, PROVIDERS, providerInfo, type Field, type Provider, type ProviderGroup, type StorageTarget } from '@shared/storage';
import { call, on } from '../../api';
import { StatusSlot, type SlotMessage } from '../../components/StatusSlot';
import { md, SHAPE } from '../../theme';
import { FolderCard, tidyPath, useFolder } from '../library/Location';
import { ToolSetup } from './ToolSetup';

const GROUP_ICON: Record<ProviderGroup, ComponentType<{ sx?: object }>> = { folder: FolderRounded, drive: CloudOutlined, storage: StorageRounded, server: DnsOutlined };

/** A fresh target for a provider, with its fields' starting values. */
export function newTarget(provider: Provider, values: Record<string, string> = {}): StorageTarget {
  const initial = Object.fromEntries(providerInfo(provider).fields.filter((f) => f.initial).map((f) => [f.key, f.initial!]));
  return { provider, values: { ...initial, ...values } };
}

/** Every place backups can go, as tiles by group. */
export function ProviderGrid({ onPick, withFolder = true }: { onPick: (p: Provider) => void; withFolder?: boolean }) {
  const groups = GROUPS.filter((g) => g.id !== 'folder');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {withFolder && <Tile id="folder" onPick={onPick} wide />}
      {groups.map((g) => (
        <div key={g.id}>
          <Typography variant="labelLarge" component="div" sx={{ color: md('onSurfaceVariant'), mb: 1 }}>
            {g.label}
          </Typography>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {PROVIDERS.filter((p) => p.group === g.id).map((p) => (
              <Tile key={p.id} id={p.id} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({ id, onPick, wide }: { id: Provider; onPick: (p: Provider) => void; wide?: boolean }) {
  const info = providerInfo(id);
  const Icon = GROUP_ICON[info.group];
  return (
    <ButtonBase
      onClick={() => onPick(id)}
      sx={{ height: 52, justifyContent: 'flex-start', gap: 1.25, px: 1.5, borderRadius: `${SHAPE.md}px`, textAlign: 'left', border: `1px solid ${md('outlineVariant')}`, backgroundColor: md('surfaceContainerLow'), '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
    >
      <Icon sx={{ fontSize: 20, color: md('primary'), flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <Typography variant="labelLarge" component="div" noWrap sx={{ color: md('onSurface') }}>
          {info.label}
        </Typography>
        {wide && (
          <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
            {info.hint}
          </Typography>
        )}
      </span>
    </ButtonBase>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  if (field.toggle) {
    return (
      <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, height: 40, cursor: 'pointer' }}>
        <Typography variant="bodyMedium" sx={{ flex: 1, color: md('onSurface') }}>
          {field.label}
        </Typography>
        <Switch checked={value === 'true'} onChange={(_, v) => onChange(v ? 'true' : '')} slotProps={{ input: { 'aria-label': field.label } }} />
      </label>
    );
  }
  if (field.file) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: '1 / -1' }}>
        <TextField size="small" fullWidth label={field.label + (field.optional ? ' (optional)' : '')} value={value} onChange={(e) => onChange(e.target.value)} />
        <Button variant="outlined" sx={{ flexShrink: 0 }} onClick={async () => onChange((await call('dialog:file', field.label)) ?? value)}>
          Choose…
        </Button>
      </div>
    );
  }
  return (
    <TextField
      size="small"
      fullWidth
      type={field.secret ? 'password' : 'text'}
      label={field.label + (field.optional ? ' (optional)' : '')}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={field.placeholder && field.placeholder.length > 30 ? { gridColumn: '1 / -1' } : undefined}
      autoComplete="off"
    />
  );
}

/** Folder choice: suggested cloud folders and drives, or any folder. */
function FolderForm({ target, onChange, suggest }: { target: StorageTarget; onChange: (t: StorageTarget) => void; suggest: 'backups' | 'none' }) {
  const path = target.values.path ?? '';
  const info = useFolder(path || null).data;
  const places = useQuery({ queryKey: ['restore-places'], queryFn: () => call('restore:places'), staleTime: 60_000 }).data ?? [];
  const sep = window.tessera.platform === 'win32' ? '\\' : '/';
  const suggestion = (p: BackupPlace) => `${p.path.replace(/[\\/]+$/, '')}${sep}Tessera Backups`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FolderCard
        info={info}
        path={path || null}
        onChange={async () => {
          const p = await call('dialog:folder', 'Choose a folder for backups', { message: 'Choose a folder for backups', buttonLabel: 'Choose', ...(path ? { defaultPath: path } : {}) });
          if (p) onChange({ ...target, values: { path: p } });
        }}
      />
      {suggest === 'backups' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 32 }}>
          {places
            .filter((p) => p.kind !== 'folder')
            .map((p) => {
              const on = path === suggestion(p);
              return (
                <ButtonBase
                  key={p.path}
                  onClick={() => onChange({ ...target, values: { path: suggestion(p) } })}
                  sx={{ gap: 0.75, px: 1.5, height: 32, borderRadius: `${SHAPE.sm}px`, fontSize: 13, border: `1px solid ${on ? md('secondaryContainer') : md('outlineVariant')}`, backgroundColor: on ? md('secondaryContainer') : 'transparent', color: on ? md('onSecondaryContainer') : md('onSurfaceVariant') }}
                >
                  {p.kind === 'cloud' ? <CloudOutlined sx={{ fontSize: 16 }} /> : <UsbRounded sx={{ fontSize: 16 }} />}
                  {p.label}
                </ButtonBase>
              );
            })}
        </div>
      )}
    </div>
  );
}

/** Signing in to a cloud drive through rclone. */
function SignIn({ target, onChange, onMessage }: { target: StorageTarget; onChange: (t: StorageTarget) => void; onMessage: (m: SlotMessage | null) => void }) {
  const info = providerInfo(target.provider);
  const status = useQuery({ queryKey: ['backup'], queryFn: () => call('backup:status'), staleTime: 0 }).data;
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => on('backup:signInUrl', setUrl), []);
  useEffect(() => () => void call('backup:cancelSignIn').catch(() => undefined), []);
  if (status && !status.rclone) {
    return (
      <div>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), mb: 1.5 }}>
          {info.label} is reached through rclone, free and open-source.
        </Typography>
        <ToolSetup tool="rclone" available={false} bundled={false} compact />
      </div>
    );
  }
  const signIn = async () => {
    setBusy(true);
    setUrl(null);
    onMessage({ tone: 'info', busy: true, text: 'Finish signing in in your browser…' });
    try {
      const remote = await call('backup:signIn', target.provider, { ...(target.values.clientId ? { id: target.values.clientId } : {}), ...(target.values.clientSecret ? { secret: target.values.clientSecret } : {}) });
      onChange({ ...target, values: { ...target.values, remote } });
      onMessage({ tone: 'success', text: `Signed in to ${info.label}.` });
    } catch (e) {
      onMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  const signedIn = !!target.values.remote;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 40 }}>
      <Button variant={signedIn ? 'outlined' : 'contained'} startIcon={<LoginRounded />} disabled={busy} onClick={() => void signIn()}>
        {signedIn ? 'Sign in again' : `Sign in to ${info.label}`}
      </Button>
      {busy && url && (
        <Button size="small" onClick={() => void call('app:openExternal', url)}>
          Open the page again
        </Button>
      )}
      {busy && (
        <Button size="small" onClick={() => void call('backup:cancelSignIn')}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/**
 * The settings for one provider: its fields, a sign-in for cloud drives, a host check for SFTP.
 * Whatever it needs to say goes in its message slot, so the form keeps its size.
 */
export function StorageForm({ target, onChange, onBack, suggest = 'none', message, onMessage }: { target: StorageTarget; onChange: (t: StorageTarget) => void; onBack?: () => void; suggest?: 'backups' | 'none'; message: SlotMessage | null; onMessage: (m: SlotMessage | null) => void }) {
  const info = providerInfo(target.provider);
  const [advanced, setAdvanced] = useState(false);
  const set = (key: string, value: string) => onChange({ ...target, values: { ...target.values, [key]: value } });
  const checkHost = async () => {
    onMessage({ tone: 'info', busy: true, text: `Checking ${target.values.host}…` });
    try {
      const k = await call('backup:hostKey', target.values.host ?? '', target.values.port ?? '22');
      onChange({ ...target, values: { ...target.values, knownHosts: k.data } });
      onMessage({ tone: 'success', text: `Server key ${k.fingerprint}. It’s checked on every connection.` });
    } catch (e) {
      onMessage({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };
  const Icon = GROUP_ICON[info.group];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}>
        {onBack && (
          <Button size="small" startIcon={<ArrowBackRounded />} onClick={onBack} sx={{ ml: -1 }}>
            All places
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <Icon sx={{ fontSize: 20, color: md('primary') }} />
        <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
          {info.label}
        </Typography>
      </div>
      {target.provider === 'folder' ? (
        <FolderForm target={target} onChange={onChange} suggest={suggest} />
      ) : (
        <>
          {info.signIn && <SignIn target={target} onChange={onChange} onMessage={onMessage} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {info.fields
              .filter((f) => !f.advanced)
              .map((f) => (
                <FieldInput key={f.key} field={f} value={target.values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
              ))}
          </div>
          {info.fields.some((f) => f.advanced) && (
            <div>
              <Button size="small" onClick={() => setAdvanced(!advanced)} endIcon={<ExpandMoreRounded sx={{ transform: advanced ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />} sx={{ ml: -1, color: md('onSurfaceVariant') }}>
                Advanced
              </Button>
              <Collapse in={advanced}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, paddingTop: 8 }}>
                  {info.fields
                    .filter((f) => f.advanced)
                    .map((f) => (
                      <FieldInput key={f.key} field={f} value={target.values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
                    ))}
                </div>
              </Collapse>
            </div>
          )}
          {target.provider === 'sftp' && (
            <Button variant="outlined" size="small" disabled={!target.values.host} onClick={() => void checkHost()} sx={{ alignSelf: 'flex-start' }}>
              {target.values.knownHosts ? 'Check the server again' : 'Check the server'}
            </Button>
          )}
        </>
      )}
      <StatusSlot message={message} />
    </div>
  );
}

/** Short text for a found folder store, for lists. */
export const foundLabel = (path: string, place: string) => `${place} · ${tidyPath(path)}`;
