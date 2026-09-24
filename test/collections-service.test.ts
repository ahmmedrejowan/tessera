/**
 * Collections, over a real library.
 *
 * A collection is a folder of its own on disk, and what it holds has to survive being read back.
 * The parts worth holding to account are the ones that decide something: rules that turn a pack
 * away and say why, a saved search that counts what matches now rather than what was put in it,
 * and the proof kept beside a licence.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NO_RULES } from '@shared/collection';
import { PIXEL, running, type PackFixture, type Running } from './library';

const PACKS: PackFixture[] = [
  { name: 'Free Kit', files: { 'Models/free.obj': 'o free\n', 'Textures/free.png': PIXEL } },
  { name: 'Credited Kit', files: { 'Models/credited.obj': 'o credited\n' }, licence: 'CC-BY-4.0' },
];

/** The library, with the two packs' ids to hand. */
async function ready(): Promise<Running & { free: string; credited: string }> {
  const app = await running(PACKS);
  const rows = app.library.require().queries.packs({ scope: 'library', text: '', filters: {} }, 'name', 0, 10).rows;
  return { ...app, free: rows.find((p) => p.name === 'Free Kit')!.id, credited: rows.find((p) => p.name === 'Credited Kit')!.id };
}

describe('a collection with rules', () => {
  it('takes what fits, turns away what does not, and says which it was and why', async () => {
    const app = await ready();
    const id = await app.library.createCollection('Only free things', { rules: { ...NO_RULES, licences: ['CC0-1.0'] } });

    const done = await app.library.changeCollection(id, { addPacks: [app.free, app.credited] });
    expect(done.addedPacks).toBe(1);
    expect(done.refused).toEqual([{ name: 'Credited Kit', why: 'its licence' }]);

    const [summary] = await app.library.collections();
    expect(summary).toMatchObject({ name: 'Only free things', packCount: 1 });
    // Its card shows something from inside the pack rather than being blank.
    expect(summary!.samples.length).toBeGreaterThan(0);
  });

  it('judges a single file by the pack it came from', async () => {
    const app = await ready();
    const id = await app.library.createCollection('Only free things', { rules: { ...NO_RULES, licences: ['CC0-1.0'] } });
    const done = await app.library.changeCollection(id, {
      add: [
        { packId: app.free, ref: 'original/Models/free.obj' },
        { packId: app.credited, ref: 'original/Models/credited.obj' },
      ],
    });
    expect(done.added).toBe(1);
    expect(done.refused.map((r) => r.why)).toEqual(['its licence']);
  });

  it('judges what joins by the rules it is being given, not the ones it had', async () => {
    const app = await ready();
    const id = await app.library.createCollection('Anything', {});
    // The rules and the pack arrive together: the new rules are the ones that decide.
    const done = await app.library.changeCollection(id, { rules: { ...NO_RULES, licences: ['CC0-1.0'] }, addPacks: [app.credited] });
    expect(done.addedPacks).toBe(0);
    expect(done.refused).toHaveLength(1);
  });
});

describe('changing a collection', () => {
  it('renames it, describes it, points it at a game, and empties it again', async () => {
    const app = await ready();
    const id = await app.library.createCollection('  ', { packs: [app.free], items: [{ packId: app.free, ref: 'original/Textures/free.png' }] });
    // A collection with no name still has one.
    expect((await app.library.collections())[0]!.name).toBe('Untitled');

    await app.library.changeCollection(id, { name: 'For the platformer', description: 'What the first level needs', projectId: 'a-game' });
    const named = (await app.library.collections())[0]!;
    expect(named).toMatchObject({ name: 'For the platformer', description: 'What the first level needs', projectId: 'a-game' });

    // An empty name leaves the one it has.
    await app.library.changeCollection(id, { name: '   ' });
    expect((await app.library.collections())[0]!.name).toBe('For the platformer');

    expect(await app.library.collectionsHolding(app.free)).toEqual([{ id, name: 'For the platformer' }]);
    expect(await app.library.collectionsHolding(app.free, 'original/Textures/free.png')).toHaveLength(1);

    await app.library.changeCollection(id, { removePacks: [app.free], remove: [{ packId: app.free, ref: 'original/Textures/free.png' }] });
    expect((await app.library.collections())[0]).toMatchObject({ packCount: 0, count: 0 });
    expect(await app.library.collectionsHolding(app.free)).toEqual([]);

    await app.library.changeCollection(id, { delete: true });
    expect(await app.library.collections()).toEqual([]);
  });

  it('counts what a saved search matches now, not what was put in it', async () => {
    const app = await ready();
    await app.library.createCollection('Every model', { query: { text: '', filters: { type: ['model'] }, includeSupport: false, favourites: false } });
    const [smart] = await app.library.collections();
    expect(smart).toMatchObject({ kind: 'smart', packCount: 0 });
    expect(smart!.count).toBe(2);
    // There is nothing to take out of a saved search, so it is never offered as somewhere to.
    expect(await app.library.collectionsHolding(app.free)).toEqual([]);
  });
});

describe('proof kept with a licence', () => {
  it('writes the file beside the licence, records it, and never overwrites another', async () => {
    const app = await ready();
    const first = await app.library.saveProof(app.free, 'page.pdf', Buffer.from('%PDF-1.4\nfirst\n'), 'Saved from the download page');
    const second = await app.library.saveProof(app.free, 'page.pdf', Buffer.from('%PDF-1.4\nsecond\n'));
    expect(second).not.toBe(first);

    const dir = join(app.root, 'packs', 'Free Kit', 'licence');
    expect(existsSync(join(dir, first))).toBe(true);
    expect(readFileSync(join(dir, second), 'utf8')).toContain('second');

    const meta = JSON.parse(readFileSync(join(app.root, 'packs', 'Free Kit', 'pack.json'), 'utf8')) as { licence: { proof: string[]; notes: string } };
    expect(meta.licence.proof).toEqual([first, second]);
    expect(meta.licence.notes).toContain('Saved from the download page');

    await app.library.addLicenceNote(app.free, 'Also kept at the Internet Archive');
    const after = JSON.parse(readFileSync(join(app.root, 'packs', 'Free Kit', 'pack.json'), 'utf8')) as { licence: { notes: string } };
    expect(after.licence.notes.split('\n')).toHaveLength(2);
  });
});
