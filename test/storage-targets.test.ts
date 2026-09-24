/**
 * Turning "where the backups go" into the arguments Kopia needs.
 *
 * This is pure translation, and it is worth holding to the letter: a wrong argument here does not
 * fail loudly, it quietly backs somebody's library up to the wrong place, or to nowhere.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import type { StorageTarget } from '@shared/storage';
import { kopiaStorage, prepareStore, storageError } from '../src/main/backup/storage';
import { tempDir } from './helpers';

const NO_RCLONE = { exe: null, config: '' };
const RCLONE = { exe: '/usr/local/bin/rclone', config: '/data/rclone.conf' };
const target = (provider: string, values: Record<string, string>): StorageTarget => ({ provider, values }) as StorageTarget;
const arg = (args: string[], name: string) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);

describe('a folder on this computer', () => {
  it('is a plain path', () => {
    const store = kopiaStorage(target('folder', { path: '/Volumes/Backups/Tessera' }), NO_RCLONE);
    expect(store.type).toBe('filesystem');
    expect(arg(store.args, '--path')).toBe('/Volumes/Backups/Tessera');
  });

  it('will not be iCloud by name: that is a folder like any other', () => {
    expect(() => kopiaStorage(target('icloud', {}), NO_RCLONE)).toThrow(/folder/i);
  });
});

describe('a cloud drive signed into through rclone', () => {
  it('says where rclone keeps the remote and where its settings are', () => {
    const store = kopiaStorage(target('gdrive', { remote: 'tessera-gdrive', folder: 'My Backups' }), RCLONE);
    expect(store.type).toBe('rclone');
    expect(arg(store.args, '--remote-path')).toBe('tessera-gdrive:My Backups');
    expect(arg(store.args, '--rclone-exe')).toBe(RCLONE.exe);
    expect(store.args.some((a) => a.includes('RCLONE_CONFIG=/data/rclone.conf'))).toBe(true);
  });

  it('falls back to a folder name rather than the drive root', () => {
    const store = kopiaStorage(target('onedrive', { remote: 'tessera-onedrive' }), RCLONE);
    expect(arg(store.args, '--remote-path')).toBe('tessera-onedrive:Tessera Backups');
  });

  it('refuses before rclone is there, and before anyone has signed in', () => {
    expect(() => kopiaStorage(target('gdrive', { remote: 'x' }), NO_RCLONE)).toThrow(/rclone/i);
    expect(() => kopiaStorage(target('gdrive', {}), RCLONE)).toThrow(/Sign in/i);
  });
});

describe('object storage', () => {
  it('passes the bucket, the endpoint and the keys', () => {
    const store = kopiaStorage(target('s3', { bucket: 'my-bucket', region: 'eu-west-1', accessKey: 'AK', secretKey: 'SK' }), NO_RCLONE);
    expect(store.type).toBe('s3');
    expect(arg(store.args, '--bucket')).toBe('my-bucket');
    expect(store.env.AWS_ACCESS_KEY_ID).toBe('AK');
    expect(store.env.AWS_SECRET_ACCESS_KEY).toBe('SK');
  });

  it('puts everything under a prefix when one is given, and not when it is not', () => {
    const withPrefix = kopiaStorage(target('s3', { bucket: 'b', prefix: 'libraries/mine' }), NO_RCLONE);
    expect(arg(withPrefix.args, '--prefix')).toBe('libraries/mine/');
    const without = kopiaStorage(target('s3', { bucket: 'b' }), NO_RCLONE);
    expect(without.args.some((a) => a.startsWith('--prefix'))).toBe(false);
  });

  it('turns encryption off only for a server that asked for it', () => {
    const plain = kopiaStorage(target('s3', { bucket: 'b', endpoint: 'http://192.168.1.10:9000' }), NO_RCLONE);
    expect(plain.args).toContain('--disable-tls');
    const secure = kopiaStorage(target('s3', { bucket: 'b', endpoint: 'https://s3.example.test' }), NO_RCLONE);
    expect(secure.args).not.toContain('--disable-tls');
  });

  it('takes a server own certificate authority, and only over an encrypted connection', () => {
    const ca = kopiaStorage(target('s3', { bucket: 'b', endpoint: 'https://s3.example.test', caFile: '/etc/ca.pem' }), NO_RCLONE);
    expect(arg(ca.args, '--root-ca-pem-path')).toBe('/etc/ca.pem');
    const plain = kopiaStorage(target('s3', { bucket: 'b', endpoint: 'http://s3.example.test', caFile: '/etc/ca.pem' }), NO_RCLONE);
    expect(plain.args.some((a) => a.startsWith('--root-ca-pem-path'))).toBe(false);
  });

  it('will skip checking a certificate only when told to in so many words', () => {
    const asked = kopiaStorage(target('s3', { bucket: 'b', endpoint: 'https://s3.example.test', insecure: 'true' }), NO_RCLONE);
    expect(asked.args).toContain('--disable-tls-verification');
    const not = kopiaStorage(target('s3', { bucket: 'b', endpoint: 'https://s3.example.test', insecure: 'false' }), NO_RCLONE);
    expect(not.args).not.toContain('--disable-tls-verification');
  });

  it('passes what Google and Azure need', () => {
    const gcs = kopiaStorage(target('gcs', { bucket: 'b', credentials: '/keys/gcs.json' }), NO_RCLONE);
    expect(gcs.type).toBe('gcs');
    expect(arg(gcs.args, '--credentials-file')).toBe('/keys/gcs.json');

    const azure = kopiaStorage(target('azure', { container: 'c', account: 'acct', key: 'secret' }), NO_RCLONE);
    expect(azure.type).toBe('azure');
    expect(arg(azure.args, '--storage-account')).toBe('acct');
    expect(azure.env.AZURE_STORAGE_KEY).toBe('secret');
  });
});

describe('a server over SSH', () => {
  it('uses a password when there is no key', () => {
    const store = kopiaStorage(target('sftp', { host: 'example.test', username: 'me', path: '/backups', password: 'hunter2', knownHosts: 'example.test ssh-ed25519 AAAA' }), NO_RCLONE);
    expect(store.type).toBe('sftp');
    expect(arg(store.args, '--port')).toBe('22');
    expect(arg(store.args, '--sftp-password')).toBe('hunter2');
    expect(arg(store.args, '--known-hosts-data')).toContain('ssh-ed25519');
  });

  it('uses a key file directly when it has no passphrase', () => {
    const dir = tempDir();
    const key = join(dir, 'id_ed25519');
    writeFileSync(key, '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmU\n-----END OPENSSH PRIVATE KEY-----\n');
    const store = kopiaStorage(target('sftp', { host: 'example.test', username: 'me', path: '/backups', keyFile: key, port: '2222' }), NO_RCLONE);
    expect(arg(store.args, '--keyfile')).toBe(key);
    expect(arg(store.args, '--port')).toBe('2222');
    expect(store.args).not.toContain('--external');
  });

  it('hands a key with a passphrase to the system ssh, which can ask the agent for it', () => {
    const dir = tempDir();
    const key = join(dir, 'id_rsa');
    // A key encrypted with a passphrase says so in its own header.
    writeFileSync(key, '-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,ABC\n\nnonsense\n-----END RSA PRIVATE KEY-----\n');
    const store = kopiaStorage(target('sftp', { host: 'example.test', username: 'me', path: '/backups', keyFile: key, knownHosts: 'example.test ssh-ed25519 AAAA' }), NO_RCLONE);
    expect(store.args).toContain('--external');
    expect(store.args.some((a) => a.startsWith('--ssh-args='))).toBe(true);
    // The server is still checked: a key from an agent is no reason to trust any host.
    expect(store.args.find((a) => a.startsWith('--ssh-args='))).toContain('StrictHostKeyChecking=yes');
  });
});

describe('WebDAV', () => {
  it('passes the address, and the user name only when there is one', () => {
    const named = kopiaStorage(target('webdav', { url: 'https://dav.example.test/backups', username: 'me', password: 'pw' }), NO_RCLONE);
    expect(named.type).toBe('webdav');
    expect(arg(named.args, '--webdav-username')).toBe('me');
    expect(named.env.KOPIA_WEBDAV_PASSWORD).toBe('pw');

    const open = kopiaStorage(target('webdav', { url: 'https://dav.example.test/backups' }), NO_RCLONE);
    expect(open.args.some((a) => a.startsWith('--webdav-username'))).toBe(false);
    expect(open.env.KOPIA_WEBDAV_PASSWORD).toBeUndefined();
  });

  it('makes the folder, and every folder above it, before backing up', async () => {
    const made: string[] = [];
    await prepareStore(target('webdav', { url: 'https://dav.example.test/a/b/c/' }), (async (url: string, init?: RequestInit) => {
      made.push(`${init?.method} ${url}`);
      return { status: 201 } as Response;
    }) as unknown as typeof fetch);

    expect(made).toEqual([
      'MKCOL https://dav.example.test/a/',
      'MKCOL https://dav.example.test/a/b/',
      'MKCOL https://dav.example.test/a/b/c/',
    ]);
  });

  it('says plainly when the server refuses the user name', async () => {
    await expect(
      prepareStore(target('webdav', { url: 'https://dav.example.test/backups', username: 'me' }), (async () => ({ status: 401 }) as Response) as unknown as typeof fetch),
    ).rejects.toMatchObject({ code: 'webdav-auth' });
  });

  it('has nothing to prepare for anywhere else', async () => {
    await expect(prepareStore(target('folder', { path: '/tmp/x' }))).resolves.toBeUndefined();
  });
});

describe('what went wrong, said plainly', () => {
  it('turns Kopia complaints into something worth reading', () => {
    for (const raw of [
      'error connecting to repository: invalid credentials',
      'unable to complete Get(kopia.repository) despite 10 retries',
      'repository not initialized in the provided storage',
      'something nobody has seen before',
    ]) {
      const said = storageError(raw);
      expect(said.length).toBeGreaterThan(0);
      expect(said).not.toContain('goroutine');
    }
  });
});
