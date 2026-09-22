import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Kopia } from '../src/main/backup/kopia';
import { kopiaStorage } from '../src/main/backup/storage';
import { findTool } from '../src/main/tools/find';
import { tempDir } from './helpers';

const exe = findTool('kopia');

// Runs against the real Kopia when it's installed; CI machines without it skip this.
describe.skipIf(!exe)('kopia backups', () => {
  it('creates a store, backs up, lists, restores and reconnects with the password', async () => {
    const dir = tempDir();
    const library = join(dir, 'library');
    const store = join(dir, 'store');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(library, 'packs', 'Kit'), { recursive: true });
    writeFileSync(join(library, 'packs', 'Kit', 'pack.json'), '{"name":"Kit"}');
    const folder = kopiaStorage({ provider: 'folder', values: { path: store } }, { exe: null, config: '' });
    const kopia = new Kopia(exe!, join(dir, 'config'));
    await kopia.connect(folder, 'correct horse', true);
    await kopia.setRetention(library, 'correct horse');
    const snap = await kopia.snapshot(library, 'correct horse');
    expect(snap.files).toBe(1);
    const list = await kopia.list(library, 'correct horse');
    expect(list.map((s) => s.id)).toEqual([snap.id]);
    // A backup with nothing new still counts the whole library.
    const again = await kopia.snapshot(library, 'correct horse');
    const both = await kopia.list(library, 'correct horse');
    expect(both.find((s) => s.id === again.id)?.files).toBe(1);
    await kopia.restore(snap.id, join(dir, 'restored'), 'correct horse');
    expect(readFileSync(join(dir, 'restored', 'packs', 'Kit', 'pack.json'), 'utf8')).toBe('{"name":"Kit"}');

    // Another computer (a fresh config) opens the same store with the password, and not without it.
    const other = new Kopia(exe!, join(dir, 'config2'));
    await expect(other.connect(folder, 'wrong password', false)).rejects.toThrow();
    await other.connect(folder, 'correct horse', false);
    expect((await other.list(library, 'correct horse')).length).toBe(2);

    // The computer that made the store tidies it, until another takes over (after a restore, say).
    execFileSync(exe!, ['maintenance', 'set', '--owner=old@lost-laptop', `--config-file=${join(dir, 'config2', 'repository.config')}`], { env: { ...process.env, KOPIA_PASSWORD: 'correct horse' } });
    expect(await other.maintenanceOwner('correct horse')).toBe('old@lost-laptop');
    await other.takeMaintenance('correct horse');
    expect(await other.maintenanceOwner('correct horse')).not.toBe('old@lost-laptop');

    // A new password: the old one stops working, the new one opens the store from anywhere.
    await other.changePassword('correct horse', 'new horse staple');
    const third = new Kopia(exe!, join(dir, 'config3'));
    await expect(third.connect(folder, 'correct horse', false)).rejects.toThrow(/password/);
    await third.connect(folder, 'new horse staple', false);
  }, 60_000);
});
