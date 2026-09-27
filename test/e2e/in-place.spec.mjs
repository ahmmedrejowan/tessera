import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startApp, waitFor } from './harness.mjs';

export const name = 'Assets that stay where they are';

/** A folder of assets somebody already has, with nothing to do with any library. */
function theirArt(dir) {
  mkdirSync(join(dir, 'Models'), { recursive: true });
  writeFileSync(join(dir, 'Models', 'tree.glb'), 'the bytes of a tree');
  writeFileSync(join(dir, 'Models', 'rock.glb'), 'the bytes of a rock, which differ');
  writeFileSync(join(dir, 'LICENSE.txt'), 'CC0 1.0 Universal');
  return dir;
}

export async function run(ok) {
  const t = await startApp();
  try {
    const lib = t.folder('Library');
    await t.call('library:create', lib, 'Test library');
    await waitFor(t, async () => (await t.call('library:state')).status === 'ready', 'the library to open');

    const theirs = theirArt(t.folder('Their Art'));
    const items = await t.call('import:plan', [theirs], 'auto');
    await t.call('import:run', items, { keep: true });
    await waitFor(t, async () => (await t.call('library:stats')).kept === 1, 'the pack to be indexed');

    const pack = (await t.call('browse:packs', { scope: 'all', text: '', filters: {} }, 'name', 0, 5)).rows[0];
    ok('the pack is read from their own folder', pack?.keptWhere === theirs, pack?.keptWhere);
    ok('and nothing of ours was written there', readdirSync(theirs).sort().join(',') === 'LICENSE.txt,Models');
    ok('the library holds the record but no copy of the files', !existsSync(join(lib, 'packs', readdirSync(join(lib, 'packs'))[0], 'original')));
    ok('its licence was read out of their folder', pack?.licence === 'CC0-1.0', String(pack?.licence));

    const refs = (await t.call('pack:files', pack.id)).map((f) => f.ref);
    ok('its files are indexed, with no original/ in the way', refs.includes('Models/tree.glb'), refs.slice(0, 3).join(', '));

    // A file of theirs is never deleted, whatever is asked.
    const gone = await t.call('assets:remove', [{ packId: pack.id, ref: 'Models/tree.glb' }]);
    ok('deleting one of their files is refused, not done', gone.removed === 0 && existsSync(join(theirs, 'Models', 'tree.glb')));

    // The drive goes away.
    rmSync(theirs, { recursive: true, force: true });
    await t.call('library:refresh');
    await waitFor(t, async () => (await t.call('library:stats')).keptAway === 1, 'the pack to be marked away');
    const away = (await t.call('browse:packs', { scope: 'all', text: '', filters: {} }, 'name', 0, 5)).rows[0];
    ok('a folder that is gone marks the pack, and keeps its files listed', away.away === true && away.fileCount > 0, `${away.fileCount} files`);

    // And comes back somewhere else.
    const moved = theirArt(t.folder('Moved Art'));
    const found = await t.call('pack:findAgain', pack.id, moved);
    ok('finding the folder again points it at the new place', found.matched === found.of && found.of > 0, `${found.matched} of ${found.of}`);
    await waitFor(t, async () => (await t.call('library:stats')).keptAway === 0, 'the pack to be back');

    // Picking a folder that holds none of its files is refused rather than silently accepted.
    const wrong = t.folder('Not It');
    writeFileSync(join(wrong, 'unrelated.txt'), 'x');
    let refused = false;
    await t.call('pack:findAgain', pack.id, wrong).catch(() => (refused = true));
    ok('and a folder that is plainly not it is refused', refused);

    // Taking it in copies the files and leaves theirs alone.
    await t.call('pack:takeIn', pack.id);
    await waitFor(t, async () => (await t.call('library:stats')).kept === 0, 'the pack to come into the library');
    const now = (await t.call('browse:packs', { scope: 'all', text: '', filters: {} }, 'name', 0, 5)).rows[0];
    ok('taking it in makes it an ordinary pack', now.keptWhere === null && now.fileCount > 0);
    ok('and leaves their folder exactly as it was', existsSync(join(moved, 'Models', 'tree.glb')));

    // A game that already has one of those files.
    const game = t.folder('Old Game');
    mkdirSync(join(game, 'ProjectSettings'), { recursive: true });
    writeFileSync(join(game, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.3.24f1\n');
    mkdirSync(join(game, 'Assets', 'Art'), { recursive: true });
    writeFileSync(join(game, 'Assets', 'Art', 'renamed-tree.glb'), 'the bytes of a tree');
    await t.call('projects:add', await t.call('projects:probe', game));
    const project = (await t.call('projects:list'))[0];

    // Only packs that have made it out of Review are matched against: an unconfirmed licence is
    // not something to go writing into somebody's credits file.
    await t.call('pack:edit', pack.id, { licence: { id: 'CC0-1.0' }, source: { name: 'Their own files' } });
    await t.call('pack:status', pack.id, 'library');
    await waitFor(t, async () => (await t.call('library:stats')).packs === 1, 'the pack to join the library');

    const scan = await t.call('projects:findAlreadyHere', project.id, 'Assets/Art');
    ok('a game’s own assets are recognised by content, not by name', scan.matches.length === 1 && scan.matches[0].path === 'Assets/Art/renamed-tree.glb', `${scan.matches.length} of ${scan.looked}`);
    const recorded = await t.call('projects:adopt', project.id, scan.matches);
    ok('recording them copies nothing', recorded === 1 && !existsSync(join(game, 'Assets', 'ThirdParty')));
    await waitFor(t, () => existsSync(join(game, 'CREDITS.md')), 'the credits to be written');
    ok('and the credits now cover what the game already shipped', readFileSync(join(game, 'CREDITS.md'), 'utf8').includes(pack.name));

    const entries = await t.call('projects:entries', project.id);
    await t.call('projects:remove', project.id, entries.map((e) => ({ packId: e.packId, ref: e.ref })));
    ok('taking one back out forgets it and leaves their file', existsSync(join(game, 'Assets', 'Art', 'renamed-tree.glb')));

    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
