import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backupPlaces, findBackups, REPO_MARKER, restoreLibrary, RestoreService, storeAt } from '../src/main/backup/restore';
import { createLibrary, MARKER } from '../src/main/library/layout';
import { findTool } from '../src/main/tools/find';

async function fakeHome() {
  const home = await mkdtemp(join(tmpdir(), 'tessera-home-'));
  const store = join(home, 'Library', 'CloudStorage', 'Dropbox', 'Backups', 'Tessera');
  await mkdir(store, { recursive: true });
  await writeFile(join(store, REPO_MARKER), '{}');
  await mkdir(join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), { recursive: true });
  await mkdir(join(home, 'Library', 'CloudStorage', 'GoogleDrive-sam@example.com'), { recursive: true });
  await mkdir(join(home, 'Documents'), { recursive: true });
  return { home, store };
}

describe('finding backups', () => {
  it('lists cloud drive folders and personal folders by friendly names', async () => {
    const { home } = await fakeHome();
    const places = await backupPlaces('darwin', home);
    const labels = places.map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining(['iCloud Drive', 'Dropbox', 'Google Drive', 'Documents']));
    expect(places.find((p) => p.label === 'Dropbox')?.kind).toBe('cloud');
  });

  it('finds a store a few folders down, and from a folder that holds one', async () => {
    const { home, store } = await fakeHome();
    const found = await findBackups(await backupPlaces('darwin', home));
    expect(found).toEqual([{ path: store, place: 'Dropbox', kind: 'cloud' }]);
    expect(await storeAt(store)).toBe(store);
    expect(await storeAt(join(store, '..'))).toBe(store);
    expect(await storeAt(home)).toBeNull();
  });
});

const kopia = findTool('kopia');

describe.skipIf(!kopia)('restoring with Kopia', () => {
  it('lists libraries from any computer and restores one, with a new id if the original is here', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-restore-'));
    const lib = join(dir, 'Studio');
    const info = await createLibrary(lib, 'Studio');
    await writeFile(join(lib, 'packs', 'note.txt'), 'hello');
    const repo = join(dir, 'repo');
    const env = { ...process.env, KOPIA_PASSWORD: 'secret-pass' };
    const cfg = `--config-file=${join(dir, 'k', 'repository.config')}`;
    execFileSync(kopia!, ['repository', 'create', 'filesystem', `--path=${repo}`, cfg, '--no-persist-credentials'], { env, stdio: 'ignore' });
    execFileSync(kopia!, ['snapshot', 'create', lib, '--description=Tessera: Studio', cfg], { env, stdio: 'ignore' });

    const restorer = new RestoreService(join(dir, 'data'), () => kopia);
    await expect(restorer.unlock({ provider: 'folder', values: { path: repo } }, 'wrong-pass')).rejects.toThrow(/password/);
    const sources = await restorer.unlock({ provider: 'folder', values: { path: repo } }, 'secret-pass');
    expect(sources).toHaveLength(1);
    expect(sources[0]!.name).toBe('Studio');
    const target = join(dir, 'Restored');
    const progress: (number | null)[] = [];
    await restorer.restore(sources[0]!.snapshots[0]!.id, target, sources[0]!.snapshots[0]!.size, (f) => progress.push(f), async () => [{ id: info.id, path: lib }]);
    expect(readFileSync(join(target, 'packs', 'note.txt'), 'utf8')).toBe('hello');
    expect(progress.at(-1)).toBe(1);
    const restored = JSON.parse(readFileSync(join(target, 'tessera-library.json'), 'utf8')) as { id: string; name: string };
    expect(restored.name).toBe('Studio');
    expect(restored.id).not.toBe(info.id);
    await restorer.close();
    expect(existsSync(join(dir, 'data', 'kopia-restore'))).toBe(false);
  }, 60_000);
});

describe('restoring a copy beside the library', () => {
  it('gives the copy its own id and name, and refuses a folder with files in it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tessera-copy-'));
    const original = join(root, 'Sandbox');
    await createLibrary(original, 'Sandbox');
    const info = JSON.parse(readFileSync(join(original, MARKER), 'utf8')) as { id: string; name: string };
    const copy = join(root, 'Sandbox from 22 Sep');
    const progress: (number | null)[] = [];
    const run = async () => {
      await mkdir(copy, { recursive: true });
      await writeFile(join(copy, MARKER), JSON.stringify(info));
    };
    await restoreLibrary(run, copy, 100, (f) => progress.push(f), async () => [{ id: info.id, path: original }], 'Sandbox from 22 Sep');
    const restored = JSON.parse(readFileSync(join(copy, MARKER), 'utf8')) as { id: string; name: string };
    expect(restored.name).toBe('Sandbox from 22 Sep');
    expect(restored.id).not.toBe(info.id);
    expect(progress.at(-1)).toBe(1);
    await expect(restoreLibrary(run, copy, 100, () => undefined, async () => [])).rejects.toThrow(/new or empty folder/);
  });
});
