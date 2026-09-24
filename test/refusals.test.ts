import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { callTool, running, type PackFixture } from './library';
import { tempDir } from './helpers';

/**
 * What happens when the disk says no. None of this is exotic: a read-only folder, a file that
 * vanishes between being listed and being read, a name already taken. The rule is the same for all
 * of it: say so plainly, and leave nothing half-done behind.
 */

const PACKS: PackFixture[] = [{ name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\n' } }];
const windows = process.platform === 'win32';

describe('a file that is not there', () => {
  it('is refused by name, not by crash, when it is added to a pack', async () => {
    const app = await running(PACKS);
    const id = (await callTool(app, 'list_packs', {}) as { packs: { id: string }[] }).packs[0]!.id;
    await expect(callTool(app, 'add_files_to_pack', { packId: id, paths: [join(tempDir(), 'gone.obj')] })).rejects.toThrow();
    // The pack is as it was: nothing half-copied, nothing missing.
    const files = (await callTool(app, 'list_files', { packId: id, only: 'everything' })) as { total: number };
    expect(files.total).toBe(1);
  });

  it('is refused when a whole pack is asked for by an id that has gone', async () => {
    const app = await running(PACKS);
    await expect(callTool(app, 'get_pack', { packId: 'not-here' })).rejects.toThrow(/No pack/);
    await expect(callTool(app, 'add_files_to_pack', { packId: 'not-here', paths: [join(tempDir(), 'x.obj')] })).rejects.toThrow();
  });
});

describe('a folder that will not take a write', () => {
  it.skipIf(windows || process.getuid?.() === 0)('says so rather than half-importing', async () => {
    const app = await running();
    const packs = join(app.root, 'packs');
    const from = tempDir();
    writeFileSync(join(from, 'thing.obj'), 'o thing\n');
    chmodSync(packs, 0o500);
    try {
      // A batch does not fail wholesale: what could not be added is named, and the rest would go
      // on. Here there is only one, so nothing is added and nothing is left behind.
      const done = (await callTool(app, 'import_paths', { paths: [from] })) as { added: unknown[]; failed: { name: string; error: string }[] };
      expect(done.added).toEqual([]);
      expect(done.failed).toHaveLength(1);
      expect(done.failed[0]!.error).toMatch(/permission|EACCES/i);
      expect(readdirSync(packs)).toEqual([]);
    } finally {
      chmodSync(packs, 0o700);
    }
  });
});

describe('a name that is already taken', () => {
  it('does not overwrite what took it when something comes back from the bin', async () => {
    const app = await running(PACKS);
    const id = (await callTool(app, 'list_packs', {}) as { packs: { id: string }[] }).packs[0]!.id;
    await callTool(app, 'delete_to_bin', { packIds: [id] });
    // Something else takes the same folder name while it is in the bin.
    const taken = join(app.root, 'packs', 'Mini Arcade');
    mkdirSync(join(taken, 'original'), { recursive: true });
    writeFileSync(join(taken, 'original', 'newer.obj'), 'o newer\n');
    const bin = (await callTool(app, 'list_bin')) as { id: string }[];
    await callTool(app, 'restore_from_bin', { ids: [bin[0]!.id] });
    // The newer folder is untouched, and the one that came back is beside it.
    expect(existsSync(join(taken, 'original', 'newer.obj'))).toBe(true);
    expect(readdirSync(join(app.root, 'packs')).length).toBe(2);
  });

  it('numbers a file added twice rather than replacing the first', async () => {
    const app = await running(PACKS);
    const id = (await callTool(app, 'list_packs', {}) as { packs: { id: string }[] }).packs[0]!.id;
    const from = tempDir();
    writeFileSync(join(from, 'extra.obj'), 'o first\n');
    await callTool(app, 'add_files_to_pack', { packId: id, paths: [join(from, 'extra.obj')] });
    writeFileSync(join(from, 'extra.obj'), 'o second\n');
    const second = (await callTool(app, 'add_files_to_pack', { packId: id, paths: [join(from, 'extra.obj')] })) as { names: string[] };
    expect(second.names[0]).not.toBe('extra.obj');
    const files = (await callTool(app, 'list_files', { packId: id, only: 'everything' })) as { files: { path: string }[] };
    expect(files.files.filter((f) => f.path.startsWith('extra')).length).toBe(2);
  });
});

describe('a library that has gone', () => {
  it('says so instead of pretending', async () => {
    const app = await running(PACKS);
    app.library.close();
    await expect(callTool(app, 'search', { text: 'anything' })).rejects.toThrow(/No library is open/);
    const status = (await callTool(app, 'library_status')) as { open: boolean };
    expect(status.open).toBe(false);
  });
});
