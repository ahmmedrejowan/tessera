import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'ssh2';
import { UserError } from '../errors';

/** The host key types asked for, one connection each, so every key the server has is known. */
const ALGORITHMS = ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512'] as const;

/** How known_hosts names a server: plain on port 22, "[host]:port" otherwise. */
export const knownHostName = (host: string, port: string) => (!port || port === '22' ? host : `[${host}]:${port}`);

function keyType(blob: Buffer): string {
  const len = blob.readUInt32BE(0);
  return blob.subarray(4, 4 + len).toString();
}

function hostKey(host: string, port: number, algorithm: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const client = new Client();
    let key: Buffer | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      client.end();
      resolve(key);
    };
    client.on('error', finish);
    client.on('close', finish);
    client.connect({
      host,
      port,
      username: 'tessera',
      readyTimeout: 8000,
      algorithms: { serverHostKey: [algorithm as never] },
      // Only the key is wanted: stop before logging in.
      hostVerifier: (k: Buffer) => {
        key = Buffer.from(k);
        setImmediate(finish);
        return false;
      },
    });
  });
}

/**
 * A server's SSH host keys, fetched by Tessera itself (no ssh-keyscan needed, which Windows often
 * lacks), as known_hosts lines, with the fingerprint people can compare.
 */
export async function hostKeys(host: string, port: string): Promise<{ data: string; fingerprint: string }> {
  const name = knownHostName(host, port);
  const keys: Buffer[] = [];
  for (const algorithm of ALGORITHMS) {
    const key = await hostKey(host, Number(port) || 22, algorithm);
    if (key && !keys.some((k) => k.equals(key))) keys.push(key);
  }
  if (!keys.length) throw new UserError('no-host-key', `Couldn’t reach ${host} on port ${port || 22}. Check the server name and port.`);
  const lines = keys.map((k) => `${name} ${keyType(k)} ${k.toString('base64')}`);
  const fingerprint = `SHA256:${createHash('sha256').update(keys[0]!).digest('base64').replace(/=+$/, '')}`;
  return { data: lines.join('\n'), fingerprint };
}

/** Whether a private key file is protected by a passphrase (PEM, PKCS#8 or OpenSSH format). */
export function keyNeedsPassphrase(pem: string): boolean {
  if (/Proc-Type: 4,ENCRYPTED|BEGIN ENCRYPTED PRIVATE KEY/.test(pem)) return true;
  const body = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]+?)-----END/.exec(pem)?.[1];
  if (!body) return false;
  const buf = Buffer.from(body.replace(/\s/g, ''), 'base64');
  const magic = 'openssh-key-v1\0'.length;
  const len = buf.readUInt32BE(magic);
  return buf.subarray(magic + 4, magic + 4 + len).toString() !== 'none';
}

export function keyFileNeedsPassphrase(path: string): boolean {
  try {
    return keyNeedsPassphrase(readFileSync(path, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * The known_hosts file the system ssh uses for Tessera's servers. It's written as "~/.ssh/…" on
 * ssh's command line: Kopia splits those arguments on spaces, and ssh expands the "~" itself.
 */
export const TESSERA_KNOWN_HOSTS = '~/.ssh/tessera_known_hosts';

/** Add (or replace) a server's keys in that file. */
export function rememberHost(data: string, home = homedir()): void {
  const dir = join(home, '.ssh');
  const file = join(dir, 'tessera_known_hosts');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const names = new Set(data.split('\n').map((l) => l.split(' ')[0]));
  const kept = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l && !names.has(l.split(' ')[0])) : [];
  writeFileSync(file, `${[...kept, ...data.split('\n')].join('\n')}\n`, { mode: 0o600 });
}

/** Take a server's keys out of that file again. */
export function forgetHost(name: string, home = homedir()): void {
  const file = join(home, '.ssh', 'tessera_known_hosts');
  if (!existsSync(file)) return;
  const kept = readFileSync(file, 'utf8').split('\n').filter((l) => l && l.split(' ')[0] !== name);
  if (kept.length) writeFileSync(file, `${kept.join('\n')}\n`, { mode: 0o600 });
  else rmSync(file, { force: true });
}
