/**
 * Where backups can live. One list of providers drives both the forms in the window and the Kopia
 * commands in the main process.
 *
 * - A folder: this computer, an external or network drive, or a cloud drive's synced folder.
 * - Cloud drives signed into through rclone: Google Drive, OneDrive, Dropbox, Box, pCloud.
 * - Object storage: Amazon S3 and S3-compatible services (Backblaze B2, Cloudflare R2, Wasabi,
 *   DigitalOcean Spaces, anything else), Google Cloud Storage, Azure Blob Storage.
 * - A server of your own: SFTP or WebDAV.
 */

export type Provider =
  | 'folder'
  | 'gdrive'
  | 'onedrive'
  | 'dropbox'
  | 'box'
  | 'pcloud'
  | 'aws'
  | 'b2'
  | 'r2'
  | 'wasabi'
  | 'spaces'
  | 's3'
  | 'gcs'
  | 'azure'
  | 'sftp'
  | 'webdav';

export type ProviderGroup = 'folder' | 'drive' | 'storage' | 'server';

/** A place to keep backups: which provider, and its settings (secrets included, while in use). */
export interface StorageTarget {
  provider: Provider;
  /** Settings by field key; see each provider's fields. */
  values: Record<string, string>;
}

export interface Field {
  key: string;
  label: string;
  /** A password or key: never shown, never saved in Tessera's settings. */
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  /** A file on this computer (chosen with a picker). */
  file?: boolean;
  /** A folder on this computer (chosen with a picker). */
  folder?: boolean;
  initial?: string;
}

export interface ProviderInfo {
  id: Provider;
  label: string;
  group: ProviderGroup;
  /** One line under the name. */
  hint: string;
  fields: Field[];
  /** Signed into in the browser, through rclone. */
  signIn?: { rcloneType: string; params: string[] };
}

const PREFIX: Field = { key: 'prefix', label: 'Folder in the bucket', optional: true, initial: 'tessera/' };
const S3_KEYS: Field[] = [
  { key: 'accessKey', label: 'Access key ID' },
  { key: 'secretKey', label: 'Secret access key', secret: true },
];
const DRIVE_FOLDER: Field = { key: 'folder', label: 'Folder in your drive', initial: 'Tessera Backups' };

export const PROVIDERS: ProviderInfo[] = [
  { id: 'folder', label: 'A folder', group: 'folder', hint: 'This computer, a drive, or a synced cloud folder', fields: [{ key: 'path', label: 'Folder', folder: true }] },

  { id: 'gdrive', label: 'Google Drive', group: 'drive', hint: 'Sign in with Google', fields: [DRIVE_FOLDER], signIn: { rcloneType: 'drive', params: ['scope=drive.file'] } },
  { id: 'onedrive', label: 'OneDrive', group: 'drive', hint: 'Sign in with Microsoft', fields: [DRIVE_FOLDER], signIn: { rcloneType: 'onedrive', params: [] } },
  { id: 'dropbox', label: 'Dropbox', group: 'drive', hint: 'Sign in with Dropbox', fields: [DRIVE_FOLDER], signIn: { rcloneType: 'dropbox', params: [] } },
  { id: 'box', label: 'Box', group: 'drive', hint: 'Sign in with Box', fields: [DRIVE_FOLDER], signIn: { rcloneType: 'box', params: [] } },
  { id: 'pcloud', label: 'pCloud', group: 'drive', hint: 'Sign in with pCloud', fields: [DRIVE_FOLDER], signIn: { rcloneType: 'pcloud', params: [] } },

  { id: 'aws', label: 'Amazon S3', group: 'storage', hint: 'An S3 bucket', fields: [{ key: 'bucket', label: 'Bucket' }, { key: 'region', label: 'Region', initial: 'us-east-1' }, ...S3_KEYS, PREFIX] },
  { id: 'b2', label: 'Backblaze B2', group: 'storage', hint: 'A B2 bucket', fields: [{ key: 'bucket', label: 'Bucket' }, { key: 'region', label: 'Region', placeholder: 'us-west-004' }, { key: 'accessKey', label: 'Key ID' }, { key: 'secretKey', label: 'Application key', secret: true }, PREFIX] },
  { id: 'r2', label: 'Cloudflare R2', group: 'storage', hint: 'An R2 bucket', fields: [{ key: 'account', label: 'Account ID' }, { key: 'bucket', label: 'Bucket' }, ...S3_KEYS, PREFIX] },
  { id: 'wasabi', label: 'Wasabi', group: 'storage', hint: 'A Wasabi bucket', fields: [{ key: 'bucket', label: 'Bucket' }, { key: 'region', label: 'Region', initial: 'us-east-1' }, ...S3_KEYS, PREFIX] },
  { id: 'spaces', label: 'DigitalOcean Spaces', group: 'storage', hint: 'A Space', fields: [{ key: 'bucket', label: 'Space name' }, { key: 'region', label: 'Region', initial: 'nyc3' }, ...S3_KEYS, PREFIX] },
  { id: 'gcs', label: 'Google Cloud Storage', group: 'storage', hint: 'A bucket, with a service account', fields: [{ key: 'bucket', label: 'Bucket' }, { key: 'credentials', label: 'Service account key (JSON)', file: true }, PREFIX] },
  { id: 'azure', label: 'Azure Blob Storage', group: 'storage', hint: 'A container', fields: [{ key: 'account', label: 'Storage account' }, { key: 'container', label: 'Container' }, { key: 'key', label: 'Account key', secret: true }, PREFIX] },
  { id: 's3', label: 'Other S3-compatible', group: 'storage', hint: 'MinIO, Garage, and more', fields: [{ key: 'endpoint', label: 'Endpoint', placeholder: 'https://s3.example.com' }, { key: 'bucket', label: 'Bucket' }, { key: 'region', label: 'Region', optional: true }, ...S3_KEYS, PREFIX] },

  {
    id: 'sftp',
    label: 'SFTP',
    group: 'server',
    hint: 'A server you can SSH into',
    fields: [
      { key: 'host', label: 'Server' },
      { key: 'port', label: 'Port', initial: '22' },
      { key: 'username', label: 'User name' },
      { key: 'path', label: 'Folder on the server', initial: 'tessera-backups' },
      { key: 'keyFile', label: 'Private key file', file: true, optional: true },
      { key: 'password', label: 'Password (without a key file)', secret: true, optional: true },
    ],
  },
  { id: 'webdav', label: 'WebDAV', group: 'server', hint: 'Nextcloud, ownCloud, a NAS', fields: [{ key: 'url', label: 'Address', placeholder: 'https://cloud.example.com/remote.php/dav/files/me/Tessera' }, { key: 'username', label: 'User name', optional: true }, { key: 'password', label: 'Password', secret: true, optional: true }] },
];

export const providerInfo = (id: Provider): ProviderInfo => PROVIDERS.find((p) => p.id === id)!;

export const GROUPS: { id: ProviderGroup; label: string }[] = [
  { id: 'drive', label: 'Cloud drives' },
  { id: 'storage', label: 'Cloud storage' },
  { id: 'server', label: 'Your own server' },
];

/** What's missing before a target can be used, or null. Sign-in providers also need a remote. */
export function targetProblem(t: StorageTarget): string | null {
  const info = providerInfo(t.provider);
  for (const f of info.fields) if (!f.optional && !t.values[f.key]?.trim()) return `Fill in “${f.label}”.`;
  if (info.signIn && !t.values.remote) return 'Sign in first.';
  if (t.provider === 'sftp' && !t.values.keyFile && !t.values.password) return 'Give a key file or a password.';
  if (t.provider === 'sftp' && !t.values.knownHosts) return 'Check the server first.';
  if (t.provider === 's3' && !/^https?:\/\//.test(t.values.endpoint ?? '')) return 'The endpoint starts with https:// (or http://).';
  return null;
}

/** A short description for people: "Google Drive · Tessera Backups", "Amazon S3 · my-bucket/tessera/". */
export function describeTarget(t: StorageTarget): string {
  const info = providerInfo(t.provider);
  const v = t.values;
  switch (info.group) {
    case 'folder':
      return v.path ?? '';
    case 'drive':
      return `${info.label} · ${v.folder ?? ''}`;
    case 'storage':
      return `${info.label} · ${v.bucket ?? v.container ?? ''}${v.prefix ? `/${v.prefix.replace(/^\/+/, '')}` : ''}`;
    default:
      return t.provider === 'sftp' ? `SFTP · ${v.username}@${v.host}:${v.path}` : `WebDAV · ${v.url ?? ''}`;
  }
}

/** The target without its secrets, for keeping in settings. */
export function withoutSecrets(t: StorageTarget): StorageTarget {
  const secret = new Set(providerInfo(t.provider).fields.filter((f) => f.secret).map((f) => f.key));
  return { provider: t.provider, values: Object.fromEntries(Object.entries(t.values).filter(([k]) => !secret.has(k))) };
}
