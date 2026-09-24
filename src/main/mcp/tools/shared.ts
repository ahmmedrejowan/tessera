import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { assetPath } from '@shared/assets';
import { linksIn } from '@shared/links';
import { NO_RULES, type CollectionItem } from '@shared/collection';
import { LICENCES } from '@shared/licences';
import { missingForLibrary, type PackEdit } from '@shared/pack';
import type { AssetSort, BrowseQuery, Facet, PackSort } from '@shared/query';
import type { ToolGroup } from '@shared/mcp';

/**
 * What an agent can do with a library. Each tool is written once here: the server registers it,
 * the tools page lists it and the skill file is written from it, so the three can't drift apart.
 *
 * The descriptions carry the rules of the place, because that is what makes an agent competent:
 * a pack needs a licence and a source before it leaves Review, deleting means the bin, archiving
 * keeps everything, and linking copies files into a game's folder.
 */

/** Everything a tool is given to do its work: the same services the window's own calls use. */
export interface ToolContext {
  library: import('../../libraryService').LibraryService;
  projects: import('../../projects/service').ProjectService;
  downloads: import('../../downloads/service').DownloadService;
  copySource: () => import('../../projects/copy').CopySource;
  libraryId: () => string;
  /** Write what an agent did into the library's activity, so it can always be seen. */
  note: (text: string, detail?: string) => void;
  settings: () => import('@shared/types').Settings;
  /** The app itself: the libraries it knows, its settings, and what has been happening. */
  app: {
    libraries: () => Promise<import('@shared/types').LibrarySummary[]>;
    openLibrary: (path: string) => Promise<import('@shared/types').LibraryState>;
    createLibrary: (path: string, name: string) => Promise<import('@shared/types').LibraryState>;
    closeLibrary: () => Promise<void>;
    updateSettings: (patch: Partial<import('@shared/types').Settings>) => Promise<import('@shared/types').Settings>;
    activity: (limit: number) => Promise<import('@shared/types').ActivityEntry[]>;
    backUpNow: () => Promise<unknown>;
    reindex: () => Promise<void>;
  };
}

export interface Tool<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  group: ToolGroup;
  title: string;
  /** What it does and when to reach for it, in the app's own words. */
  summary: string;
  input: T;
  run: (args: z.infer<T>, ctx: ToolContext) => Promise<unknown>;
}

export const define = <T extends z.ZodTypeAny>(tool: Tool<T>): Tool => tool as unknown as Tool;

export const scope = z.enum(['library', 'inbox', 'all']).default('library').describe('library: what you can browse. inbox: packs waiting in Review. all: both.');
export const filters = z
  .record(z.string(), z.array(z.string()))
  .optional()
  .describe('Narrow by facet: type, format, source, creator, licence, genre, style, tag. Values within a facet are ORed, facets are ANDed.');

/** A pack as an agent sees it: enough to decide, not the whole record. */
export const packOut = (p: import('@shared/query').PackRow) => ({
  id: p.id,
  name: p.name,
  licence: p.licence,
  creator: p.creator,
  source: p.source,
  assets: p.assetCount,
  files: p.fileCount,
  bytes: p.size,
  kinds: p.types,
  tags: p.tags,
  styles: p.styles,
  starred: p.fav,
  archived: p.archived,
  status: p.status,
});

export const assetOut = (a: import('@shared/query').AssetRow) => ({
  id: a.id,
  name: a.name,
  packId: a.packId,
  pack: a.packName,
  path: assetPath(a.ref),
  ref: a.ref,
  type: a.type,
  format: a.ext,
  formats: a.formats,
  bytes: a.size,
  licence: a.licence,
  starred: a.fav,
});

export const ASSET_SORTS: AssetSort[] = ['relevance', 'name', 'added', 'size', 'pack', 'type'];
export const PACK_SORTS: PackSort[] = ['name', 'added', 'size', 'count'];

/** The files of a pack as the window counts them: its assets, not the archive that holds them. */
export const packAssets = (ctx: ToolContext, packId: string): { packId: string; ref: string }[] =>
  ctx.library
    .require()
    .queries.assets({ scope: 'all', text: '', filters: {}, packIds: [packId] }, 'name', 0, 100_000)
    .rows.map((a) => ({ packId: a.packId, ref: a.ref }));

/** A path from an agent is only meaningful if it is absolute: the app's own folder is not its business. */
export const absolute = (paths: string[]): string[] => {
  const wrong = paths.filter((p) => !isAbsolute(p));
  if (wrong.length) throw new Error(`Give a full path from the top of the disk, not ${wrong[0]}.`);
  return paths;
};

export const query = (args: { text?: string; filters?: Record<string, string[]>; scope?: 'library' | 'inbox' | 'all'; starred?: boolean }): BrowseQuery => ({
  scope: args.scope ?? 'library',
  text: args.text ?? '',
  filters: (args.filters ?? {}) as Partial<Record<Facet, string[]>>,
  ...(args.starred ? { favourites: true } : {}),
});
