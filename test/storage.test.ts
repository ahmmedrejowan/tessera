import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { describeTarget, targetProblem, withoutSecrets, type StorageTarget } from '../src/shared/storage';
import { Kopia } from '../src/main/backup/kopia';
import { RestoreService } from '../src/main/backup/restore';
import { hostKeys, kopiaStorage, storageError } from '../src/main/backup/storage';
import { createLibrary } from '../src/main/library/layout';
import { findTool } from '../src/main/tools/find';

const noRclone = { exe: null, config: '' };
const t = (provider: StorageTarget['provider'], values: Record<string, string>): StorageTarget => ({ provider, values });

describe('storage for Kopia', () => {
  it('builds S3 flags for each service, with keys in the environment', () => {
    const aws = kopiaStorage(t('aws', { bucket: 'b', region: 'eu-west-1', accessKey: 'AK', secretKey: 'SK', prefix: 'tessera' }), noRclone);
    expect(aws).toEqual({ type: 's3', args: ['--bucket=b', '--endpoint=s3.eu-west-1.amazonaws.com', '--region=eu-west-1', '--prefix=tessera/'], env: { AWS_ACCESS_KEY_ID: 'AK', AWS_SECRET_ACCESS_KEY: 'SK' } });
    expect(kopiaStorage(t('b2', { bucket: 'b', region: 'us-west-004', accessKey: 'k', secretKey: 's' }), noRclone).args).toContain('--endpoint=s3.us-west-004.backblazeb2.com');
    expect(kopiaStorage(t('r2', { account: 'abc', bucket: 'b', accessKey: 'k', secretKey: 's' }), noRclone).args).toEqual(['--bucket=b', '--endpoint=abc.r2.cloudflarestorage.com', '--region=auto']);
    const local = kopiaStorage(t('s3', { endpoint: 'http://127.0.0.1:9000/', bucket: 'b', accessKey: 'k', secretKey: 's' }), noRclone);
    expect(local.args).toEqual(['--bucket=b', '--endpoint=127.0.0.1:9000', '--disable-tls']);
    for (const s of [aws, local]) expect(s.args.join(' ')).not.toMatch(/SK|=s\b/);
  });

  it('builds the other kinds', () => {
    expect(kopiaStorage(t('folder', { path: '/x' }), noRclone)).toEqual({ type: 'filesystem', args: ['--path=/x'], env: {} });
    expect(kopiaStorage(t('azure', { account: 'acc', container: 'c', key: 'K' }), noRclone)).toEqual({ type: 'azure', args: ['--container=c', '--storage-account=acc'], env: { AZURE_STORAGE_KEY: 'K' } });
    expect(kopiaStorage(t('webdav', { url: 'https://d/x', username: 'u', password: 'p' }), noRclone)).toMatchObject({ type: 'webdav', args: ['--url=https://d/x', '--webdav-username=u'], env: { KOPIA_WEBDAV_PASSWORD: 'p' } });
    expect(kopiaStorage(t('sftp', { host: 'h', port: '2222', username: 'u', path: 'p', keyFile: '/k', knownHosts: 'h ssh-ed25519 AAA' }), noRclone).args).toEqual(['--host=h', '--port=2222', '--username=u', '--path=p', '--keyfile=/k', '--known-hosts-data=h ssh-ed25519 AAA']);
    expect(kopiaStorage(t('gdrive', { remote: 'r1', folder: 'Tessera Backups' }), { exe: '/bin/rclone', config: '/c/rclone.conf' }).args).toEqual(['--remote-path=r1:Tessera Backups', '--rclone-exe=/bin/rclone', '--rclone-env=RCLONE_CONFIG=/c/rclone.conf']);
    expect(() => kopiaStorage(t('gdrive', { folder: 'x' }), noRclone)).toThrow(/rclone/);
  });

  it('says what’s missing, describes targets, and keeps secrets out of settings', () => {
    expect(targetProblem(t('aws', { bucket: 'b', region: 'r', accessKey: 'k' }))).toBe('Fill in “Secret access key”.');
    expect(targetProblem(t('dropbox', { folder: 'x' }))).toBe('Sign in first.');
    expect(targetProblem(t('sftp', { host: 'h', port: '22', username: 'u', path: 'p', password: 'x' }))).toBe('Check the server first.');
    expect(targetProblem(t('s3', { endpoint: 's3.example.com', bucket: 'b', accessKey: 'k', secretKey: 's' }))).toMatch(/https/);
    expect(describeTarget(t('aws', { bucket: 'b', prefix: 'tessera/' }))).toBe('Amazon S3 · b/tessera/');
    expect(describeTarget(t('gdrive', { folder: 'Tessera Backups' }))).toBe('Google Drive · Tessera Backups');
    expect(withoutSecrets(t('aws', { bucket: 'b', accessKey: 'k', secretKey: 's' })).values).toEqual({ bucket: 'b', accessKey: 'k' });
  });

  it('says Kopia’s errors plainly', () => {
    expect(storageError('unable to create format manager: invalid repository password')).toMatch(/password/);
    expect(storageError('found existing data in storage location')).toMatch(/already/);
    expect(storageError('The specified bucket does not exist (NoSuchBucket)')).toMatch(/bucket/);
    expect(storageError('dial tcp 10.0.0.1:443: connection refused')).toMatch(/reach/);
    expect(storageError('repository not initialized in the provided storage')).toMatch(/No backups here/);
  });
});

const kopia = findTool('kopia');
const rclone = findTool('rclone');
const children: ChildProcess[] = [];
afterAll(() => children.forEach((c) => c.kill()));

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

async function serve(kind: 's3' | 'webdav' | 'sftp', dir: string, port: number): Promise<void> {
  const auth = kind === 's3' ? ['--auth-key', 'AKTEST,SKTEST'] : ['--user', 'tess', '--pass', 'pw-123456'];
  const child = spawn(rclone!, ['serve', kind, dir, '--addr', `127.0.0.1:${port}`, ...auth, '--config', '/dev/null'], { stdio: 'ignore' });
  children.push(child);
  for (let i = 0; i < 50; i++) {
    const up = await new Promise<boolean>((resolve) => {
      const sock = createServer().listen(port, '127.0.0.1');
      sock.on('listening', () => sock.close(() => resolve(false)));
      sock.on('error', () => resolve(true));
    });
    if (up) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`rclone serve ${kind} didn’t start`);
}

/** Back up a small library to a target, then find it again from "another computer". */
async function roundTrip(target: StorageTarget, rcloneConfig = '') {
  const dir = await mkdtemp(join(tmpdir(), 'tessera-store-'));
  const lib = join(dir, 'Lib');
  await createLibrary(lib, 'Lib');
  await writeFile(join(lib, 'packs', 'a.txt'), 'hello');
  const setup = { exe: rclone, config: rcloneConfig };
  const k = new Kopia(kopia!, join(dir, 'k1'));
  await k.connect(kopiaStorage(target, setup), 'pass-1234', true);
  await k.snapshot(lib, 'pass-1234', 'Lib');
  const restorer = new RestoreService(join(dir, 'data'), () => kopia, () => setup);
  const sources = await restorer.unlock(target, 'pass-1234');
  await restorer.close();
  return sources;
}

describe.skipIf(!kopia || !rclone)('backing up to real servers', () => {
  it('S3-compatible storage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-s3-'));
    await mkdir(join(dir, 'bucket'));
    const port = await freePort();
    await serve('s3', dir, port);
    const sources = await roundTrip(t('s3', { endpoint: `http://127.0.0.1:${port}`, bucket: 'bucket', accessKey: 'AKTEST', secretKey: 'SKTEST', prefix: 'tessera/' }));
    expect(sources.map((s) => s.name)).toEqual(['Lib']);
  }, 60_000);

  it('WebDAV', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-dav-'));
    const port = await freePort();
    await serve('webdav', dir, port);
    const sources = await roundTrip(t('webdav', { url: `http://127.0.0.1:${port}/backups/tessera`, username: 'tess', password: 'pw-123456' }));
    expect(sources.map((s) => s.name)).toEqual(['Lib']);
  }, 60_000);

  it('SFTP, with the server’s key checked', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-sftp-'));
    const port = await freePort();
    await serve('sftp', dir, port);
    const key = await hostKeys('127.0.0.1', String(port));
    expect(key.fingerprint).toMatch(/^SHA256:/);
    const sources = await roundTrip(t('sftp', { host: '127.0.0.1', port: String(port), username: 'tess', password: 'pw-123456', path: 'tessera', knownHosts: key.data }));
    expect(sources.map((s) => s.name)).toEqual(['Lib']);
  }, 60_000);

  it('a cloud drive through rclone (a local remote standing in)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-rclone-'));
    const config = join(dir, 'rclone.conf');
    await writeFile(config, `[stand-in]\ntype = alias\nremote = ${join(dir, 'drive')}\n`);
    await mkdir(join(dir, 'drive'));
    const sources = await roundTrip(t('gdrive', { remote: 'stand-in', folder: 'Tessera Backups' }), config);
    expect(sources.map((s) => s.name)).toEqual(['Lib']);
  }, 60_000);
});
