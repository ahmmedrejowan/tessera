/**
 * What each tool gives back, and one answer as an agent would see it. The window shows these on
 * the tools page, so a person can judge a tool without calling it, and an agent can be told what
 * to expect. They are written by hand from the tools' own returns; a missing entry simply shows
 * nothing rather than a guess.
 */

export interface ToolAnswer {
  /** One line: what comes back. */
  returns: string;
  /** A short answer of that shape. */
  example: unknown;
}

const PACK_ID = 'c0a8f2e1-4d7b-4a3e-9f10-6b2d8e5c1a44';

export const ANSWERS: Record<string, ToolAnswer> = {
  library_status: {
    returns: 'Which library is open, what is in it, and what wants attention.',
    example: {
      open: true,
      name: 'Tessera Library',
      path: '/Users/you/Documents/Tessera Library',
      packs: 42,
      assets: 18320,
      bytes: 9123456789,
      archived: 3,
      waitingInReview: 1,
      needsAttention: { noLicence: 1, noSource: 0, noCreditLine: 2 },
    },
  },
  search: {
    returns: 'A page of matches, with the total so you know how much is behind it.',
    example: {
      total: 3,
      packs: [{ id: PACK_ID, name: 'Mini Arcade', licence: 'CC0-1.0', creator: 'Kenney', assets: 20, files: 20, bytes: 1263291, kinds: ['model'], tags: ['arcade'], starred: false, archived: false, status: 'library' }],
    },
  },
  get_pack: {
    returns: 'Everything recorded about one pack, including any part of it under different terms.',
    example: {
      id: PACK_ID,
      name: 'Mini Arcade',
      licence: 'CC0-1.0',
      creator: 'Kenney',
      source: 'kenney.nl',
      sourceUrl: 'https://kenney.nl/assets/mini-arcade',
      assets: 20,
      files: 20,
      bytes: 1263291,
      kinds: ['model'],
      tags: ['arcade', 'low poly'],
      creditLine: 'Mini Arcade by Kenney (CC0)',
      partsWithTheirOwnLicence: [{ path: 'Extras/logo.png', licence: 'CC-BY-4.0' }],
      proof: ['licence.txt'],
      problems: [],
    },
  },
  list_files: {
    returns: 'The files of one pack, a page at a time, each with the licence covering it.',
    example: {
      total: 20,
      files: [{ id: 1841, name: 'arcade_machine.fbx', path: 'Models/arcade_machine.fbx', type: 'model', format: '.fbx', bytes: 61244, licence: 'CC0-1.0', starred: false }],
    },
  },
  get_asset: {
    returns: 'One file in full, with the other formats the same asset comes in.',
    example: {
      id: 1841,
      name: 'arcade_machine.fbx',
      packId: PACK_ID,
      pack: 'Mini Arcade',
      path: 'Models/arcade_machine.fbx',
      type: 'model',
      format: '.fbx',
      bytes: 61244,
      licence: 'CC0-1.0',
      otherFormats: [{ id: 1842, format: '.obj', bytes: 70112 }],
    },
  },
  list_facets: {
    returns: 'The values in use for each facet, with how many things carry each: what you can filter by.',
    example: { type: [{ value: 'model', count: 320 }], licence: [{ value: 'CC0-1.0', count: 40 }], creator: [{ value: 'Kenney', count: 12 }] },
  },
  list_collections: {
    returns: 'Every collection, what it holds, and what it will accept.',
    example: [{ id: 'fav', name: 'Favourites', packs: 2, assets: 120, rules: { licences: [], needsCreditLine: false }, projectId: null, kind: 'manual' }],
  },
  list_projects: {
    returns: 'The games this library links into, with how much each has taken.',
    example: [{ id: '2b864e02-74bf-404d-a3dd-7a9c4d9ecda5', name: 'Bunny Dash', engine: 'unity', path: '/Users/you/Games/BunnyDash', assets: 37, packs: 4, exists: true }],
  },
  usage: {
    returns: 'Which games have files from these packs, and how many.',
    example: [{ projectId: '2b864e02-74bf-404d-a3dd-7a9c4d9ecda5', name: 'Bunny Dash', files: 3 }],
  },
  list_review: {
    returns: 'Packs that cannot join the library yet, each with what it still needs.',
    example: [{ id: PACK_ID, name: 'Rocks', licence: null, source: null, assets: 3, needs: ['licence', 'source'] }],
  },
  list_bin: {
    returns: 'What is waiting in the bin, with when it went and how big it is.',
    example: [{ id: 'f4db0f1a-9c6d-4a51-8158-d338378d57b2', kind: 'pack', shown: 'Mini Arcade', packName: 'Mini Arcade', size: 1263291, deletedAt: '2026-09-24T02:14:09.412Z' }],
  },
  list_packs: {
    returns: 'A page of packs, short lines, with the total behind them.',
    example: { total: 42, offset: 0, packs: [{ id: PACK_ID, name: 'Mini Arcade', licence: 'CC0-1.0', creator: 'Kenney', assets: 20, bytes: 1263291, kinds: ['model'], status: 'library', archived: false }] },
  },
  list_assets: {
    returns: 'A page of files, short lines, with the total behind them.',
    example: { total: 18320, offset: 0, assets: [{ id: 1841, name: 'arcade_machine.fbx', packId: PACK_ID, path: 'Models/arcade_machine.fbx', type: 'model', format: '.fbx', bytes: 61244, licence: 'CC0-1.0' }] },
  },
  list_activity: {
    returns: 'The library’s own record, newest first.',
    example: [{ at: '2026-09-24T02:14:09.412Z', kind: 'agent', text: 'An agent starred 1 thing', detail: null }],
  },
  pack_folders: {
    returns: 'The folders inside a pack, as paths you can pass to add_files_to_pack.',
    example: { folders: ['Models', 'Models/Props', 'Textures'] },
  },
  project_files: {
    returns: 'What a game has taken, with the licence and credit line recorded for each.',
    example: [{ packId: PACK_ID, pack: 'Mini Arcade', path: 'Models/arcade_machine.fbx', files: ['Assets/Tessera/Mini Arcade/arcade_machine.fbx'], licence: 'CC0-1.0', creditLine: 'Mini Arcade by Kenney (CC0)', copiedAt: '2026-09-24T02:14:09.412Z' }],
  },
  list_downloads: {
    returns: 'The download queue, with how far each has got.',
    example: [{ id: 'dl-muelqx6u-qjhu43', url: 'https://example.com/pack.zip', name: 'pack.zip', state: 'going', received: 4194304, size: 12582912, error: null }],
  },
  star: {
    returns: 'How many packs and files were starred or unstarred.',
    example: { starred: true, packs: 1, assets: 0 },
  },
  create_collection: {
    returns: 'The id of the new collection.',
    example: { id: '2c759f6f-7608-4921-8968-cdf466a988e5' },
  },
  add_to_collection: {
    returns: 'What went in, and what the collection’s rules refused, with a reason.',
    example: { added: 4, addedPacks: 1, refused: [{ name: 'Sky HDRI', why: 'its licence is not one this collection takes' }] },
  },
  remove_from_collection: { returns: 'That it is done.', example: { done: true } },
  edit_collection: { returns: 'That it is done.', example: { done: true } },
  delete_collection: { returns: 'That it is done.', example: { done: true } },
  set_pack_details: {
    returns: 'What the pack still needs before it can leave Review, read back after the change.',
    example: { done: true, stillNeeds: ['source'], inReview: true },
  },
  set_file_licence: {
    returns: 'That it is done, and how many files the rule covers.',
    example: { done: true, files: 3 },
  },
  set_pack_cover: { returns: 'That it is done.', example: { done: true } },
  move_to_library: {
    returns: 'Which packs moved, and which were refused with why.',
    example: { moved: [PACK_ID], refused: [{ packId: 'other-id', why: 'Add source before moving this pack to the library.' }] },
  },
  archive_pack: { returns: 'That it is done.', example: { done: true } },
  link_to_game: {
    returns: 'How many assets were copied into the game.',
    example: { linked: 3 },
  },
  unlink_from_game: { returns: 'How many were taken out of the game.', example: { removed: 3 } },
  add_game: {
    returns: 'The game as Tessera now knows it, and anything worth saying about the project.',
    example: { id: '2b864e02-74bf-404d-a3dd-7a9c4d9ecda5', name: 'Bunny Dash', engine: 'unity', target: 'Assets/Tessera', notes: ['glTFast isn’t installed, so models are copied as FBX.'] },
  },
  edit_game: { returns: 'That it is done.', example: { done: true } },
  forget_game: { returns: 'That it is done.', example: { done: true } },
  import_paths: {
    returns: 'The packs that were made, each with whether it went into the library or waits in Review, and anything that failed.',
    example: { added: [{ id: PACK_ID, name: 'Rocks', status: 'inbox' }], failed: [] },
  },
  add_files_to_pack: {
    returns: 'How many files went in, and what they are called inside the pack.',
    example: { added: 2, names: ['Extras/rock_a.obj', 'Extras/rock_b.obj'] },
  },
  add_downloads: {
    returns: 'How many links were queued, and how many were skipped as not being files.',
    example: { added: 1, skipped: 1 },
  },
  download_control: { returns: 'That it is done.', example: { done: true } },
  delete_to_bin: {
    returns: 'What went to the bin: whole packs by name, and the count of single files.',
    example: { packs: ['Mini Arcade'], files: { removed: 2, inArchive: 0, failed: 0 } },
  },
  restore_from_bin: { returns: 'How many things were put back.', example: { restored: 1 } },
  list_libraries: {
    returns: 'The libraries this computer knows, and which is open.',
    example: {
      open: { id: '562ac653-208a-4095-b02e-95cf5bb44198', name: 'Tessera Library', path: '/Users/you/Documents/Tessera Library' },
      libraries: [{ id: '562ac653-208a-4095-b02e-95cf5bb44198', name: 'Tessera Library', path: '/Users/you/Documents/Tessera Library', lastOpenedAt: '2026-09-24T02:14:09.412Z' }],
    },
  },
  open_library: { returns: 'That it is open, and which one.', example: { open: true, name: 'Toy Town', path: '/Users/you/Documents/Toy Town' } },
  create_library: { returns: 'That it was made, and where.', example: { made: true, name: 'Toy Town', path: '/Users/you/Documents/Toy Town' } },
  close_library: { returns: 'That it is closed.', example: { closed: true } },
  get_settings: {
    returns: 'Tessera’s settings, without anything secret.',
    example: { theme: 'system', seedColor: '#3f6f8f', afterDownload: 'sure', binKeepDays: 30, updateCheck: true, siteRules: [{ host: 'kenney.nl', licence: 'CC0-1.0', creditLine: null, note: '' }] },
  },
  set_settings: { returns: 'Which settings were changed.', example: { changed: ['binKeepDays'] } },
  read_library_again: { returns: 'That it is done.', example: { done: true } },
  back_up_now: { returns: 'That it is done.', example: { done: true } },
  empty_bin: { returns: 'How many things went from the disk for good.', example: { gone: 3 } },
  discard_review_pack: { returns: 'That it is done.', example: { done: true } },
};
