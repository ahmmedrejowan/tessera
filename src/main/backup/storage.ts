import { providerInfo, type StorageTarget } from '@shared/storage';
import { UserError } from '../errors';
import { keyFileNeedsPassphrase, rememberHost, TESSERA_KNOWN_HOSTS } from './ssh';

/** How Kopia reaches a store: its storage type, the flags for it, and secrets passed by environment. */
export interface KopiaStorage {
  type: string;
  args: string[];
  env: Record<string, string>;
  /** Anything to make before a new store can be created there. */
  prepare?: () => Promise<void>;
}

export interface RcloneSetup {
  exe: string | null;
  config: string;
}

const prefixOf = (p: string | undefined) => {
  const clean = (p ?? '').trim().replace(/^\/+/, '');
  return clean && !clean.endsWith('/') ? `${clean}/` : clean;
};

/** Where each S3-compatible service is, from its settings. */
function s3Endpoint(t: StorageTarget): { endpoint: string; region: string; tls: boolean } {
  const v = t.values;
  const region = (v.region ?? '').trim();
  switch (t.provider) {
    case 'aws':
      return { endpoint: `s3.${region || 'us-east-1'}.amazonaws.com`, region: region || 'us-east-1', tls: true };
    case 'b2':
      return { endpoint: `s3.${region}.backblazeb2.com`, region, tls: true };
    case 'r2':
      return { endpoint: `${(v.account ?? '').trim()}.r2.cloudflarestorage.com`, region: 'auto', tls: true };
    case 'wasabi':
      return { endpoint: `s3.${region || 'us-east-1'}.wasabisys.com`, region: region || 'us-east-1', tls: true };
    case 'spaces':
      return { endpoint: `${region || 'nyc3'}.digitaloceanspaces.com`, region: region || 'nyc3', tls: true };
    default: {
      const raw = (v.endpoint ?? '').trim();
      return { endpoint: raw.replace(/^https?:\/\//, '').replace(/\/+$/, ''), region, tls: !raw.startsWith('http://') };
    }
  }
}

/**
 * The Kopia storage for a target. Keys and passwords go in the environment wherever Kopia reads
 * them from there, so they never show in the list of running processes (SFTP's password is the
 * exception: Kopia only takes it as a flag, so a key file is the better choice).
 */
export function kopiaStorage(t: StorageTarget, rclone: RcloneSetup): KopiaStorage {
  const v = t.values;
  const info = providerInfo(t.provider);
  if (info.signIn) {
    if (!rclone.exe) throw new UserError('no-rclone', 'rclone isn’t set up on this computer yet.');
    if (!v.remote) throw new UserError('not-signed-in', `Sign in to ${info.label} first.`);
    return { type: 'rclone', args: [`--remote-path=${v.remote}:${(v.folder ?? 'Tessera Backups').trim()}`, `--rclone-exe=${rclone.exe}`, `--rclone-env=RCLONE_CONFIG=${rclone.config}`], env: {} };
  }
  switch (t.provider) {
    case 'folder':
      return { type: 'filesystem', args: [`--path=${v.path}`], env: {} };
    case 'gcs':
      return { type: 'gcs', args: [`--bucket=${v.bucket}`, `--credentials-file=${v.credentials}`, ...(prefixOf(v.prefix) ? [`--prefix=${prefixOf(v.prefix)}`] : [])], env: {} };
    case 'azure':
      return { type: 'azure', args: [`--container=${v.container}`, `--storage-account=${v.account}`, ...(prefixOf(v.prefix) ? [`--prefix=${prefixOf(v.prefix)}`] : [])], env: { AZURE_STORAGE_KEY: v.key ?? '' } };
    case 'sftp': {
      const base = [`--host=${v.host}`, `--port=${v.port || '22'}`, `--username=${v.username}`, `--path=${v.path}`];
      // A key with a passphrase can't be read by Kopia itself: the system ssh uses it from the SSH
      // agent instead, checking the server against the keys fetched when it was set up.
      if (v.keyFile && keyFileNeedsPassphrase(v.keyFile)) {
        if (v.knownHosts) rememberHost(v.knownHosts);
        const ssh = ['-p', v.port || '22', '-o', `UserKnownHostsFile=${TESSERA_KNOWN_HOSTS}`, '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes'];
        return { type: 'sftp', args: [...base, '--external', '--ssh-command=ssh', `--ssh-args=${ssh.join(' ')}`], env: {} };
      }
      return { type: 'sftp', args: [...base, ...(v.keyFile ? [`--keyfile=${v.keyFile}`] : [`--sftp-password=${v.password ?? ''}`]), `--known-hosts-data=${v.knownHosts ?? ''}`], env: {} };
    }
    case 'webdav':
      return { type: 'webdav', args: [`--url=${v.url}`, ...(v.username ? [`--webdav-username=${v.username}`] : [])], env: v.password ? { KOPIA_WEBDAV_PASSWORD: v.password } : {}, prepare: () => prepareStore(t) };
    default: {
      const { endpoint, region, tls } = s3Endpoint(t);
      return {
        type: 's3',
        args: [
          `--bucket=${v.bucket}`,
          `--endpoint=${endpoint}`,
          ...(region ? [`--region=${region}`] : []),
          ...(prefixOf(v.prefix) ? [`--prefix=${prefixOf(v.prefix)}`] : []),
          ...(tls ? [] : ['--disable-tls']),
          // A self-hosted server with its own certificate authority, or (by choice) none checked.
          ...(tls && v.caFile ? [`--root-ca-pem-path=${v.caFile}`] : []),
          ...(tls && v.insecure === 'true' ? ['--disable-tls-verification'] : []),
        ],
        env: { AWS_ACCESS_KEY_ID: v.accessKey ?? '', AWS_SECRET_ACCESS_KEY: v.secretKey ?? '' },
      };
    }
  }
}

/**
 * Make what a new store needs that Kopia won't make itself: the folder at a WebDAV address. One
 * that's already there is fine.
 */
export async function prepareStore(t: StorageTarget, fetcher: typeof fetch = fetch): Promise<void> {
  if (t.provider !== 'webdav') return;
  const url = (t.values.url ?? '').replace(/\/+$/, '');
  const headers: Record<string, string> = {};
  if (t.values.username) headers.Authorization = `Basic ${Buffer.from(`${t.values.username}:${t.values.password ?? ''}`).toString('base64')}`;
  // Parents first, from the server's root, so a path several folders deep works too.
  const { origin, pathname } = new URL(url);
  const parts = pathname.split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const res = await fetcher(`${origin}/${parts.slice(0, i).join('/')}/`, { method: 'MKCOL', headers }).catch(() => null);
    if (res && res.status === 401) throw new UserError('webdav-auth', 'The WebDAV server refused the user name or password.');
  }
}

/** Kopia's errors about a store, said plainly. */
export function storageError(message: string): string {
  if (/invalid (repository )?password|incorrect password/i.test(message)) return 'That password doesn’t open these backups.';
  if (/RequestTimeTooSkewed|time.{0,20}skew|clock skew/i.test(message)) return 'This computer’s clock is off, so the storage service refused it. Set the date and time automatically, then try again.';
  if (/x509|certificate (signed by unknown|is not trusted|has expired|is valid for)|unknown authority|tls: failed to verify/i.test(message)) return 'The server’s certificate isn’t trusted by this computer. For a self-signed certificate, add its certificate authority under Advanced (S3), or to this computer’s trusted certificates (WebDAV).';
  if (/Permission denied \(publickey|unable to authenticate|no supported methods remain/i.test(message)) return 'The server refused the key. A key with a passphrase is used through your SSH agent: add it with ssh-add (on a Mac, ssh-add --apple-use-keychain), then try again.';
  if (/rateLimitExceeded|userRateLimitExceeded|too many requests|429/i.test(message)) return 'The service is limiting how fast Tessera can go. It carries on later; for large backups, use your own client ID (Advanced).';
  if (/found existing data|already (exists|initialized)/i.test(message)) return 'There are backups here already. Choose “Use existing backups”.';
  if (/NoSuchBucket|bucket.*not exist/i.test(message)) return 'That bucket doesn’t exist.';
  if (/access denied|forbidden|403|InvalidAccessKeyId|SignatureDoesNotMatch|unauthorized|401/i.test(message)) return 'The keys or password were refused. Check them and try again.';
  if (/no such host|could not resolve|dial tcp|connection refused|timeout/i.test(message)) return 'Couldn’t reach the server. Check the address and your connection.';
  if (/repository not initialized|not found|does not exist|NoSuchKey|BLOB not found/i.test(message)) return 'No backups here yet. Choose “Start new backups”.';
  return message;
}
