import { z } from 'zod';

/**
 * A collection, stored as `collections/<id>.json` in the library so it travels with it.
 * Manual collections list assets by pack and path (stable across re-indexing); smart ones keep a
 * search and show whatever matches it now.
 */

export const COLLECTION_FORMAT = 1;

/**
 * The collection every library has: what its owner starred. It is made the first time something is
 * starred, and it can't be renamed or deleted, but otherwise it is an ordinary collection.
 */
export const FAVOURITES = 'favourites';
export const FAVOURITES_NAME = 'Favourites';

export const CollectionItem = z.object({ packId: z.string(), ref: z.string() });
export type CollectionItem = z.infer<typeof CollectionItem>;

export const SmartQuery = z.object({
  text: z.string().default(''),
  filters: z.record(z.string(), z.array(z.string())).default({}),
  includeSupport: z.boolean().default(false),
  favourites: z.boolean().default(false),
});
export type SmartQuery = z.infer<typeof SmartQuery>;

/**
 * What a collection will take. A rule says "only these": anything that doesn't fit is refused when
 * it is added, so a collection meant for one game's licence can't quietly gain something it may
 * not ship. An empty list means that side is not fussy.
 */
export const CollectionRules = z.object({
  licences: z.array(z.string()).default([]),
  creators: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  types: z.array(z.string()).default([]),
});
export type CollectionRules = z.infer<typeof CollectionRules>;

export const NO_RULES: CollectionRules = { licences: [], creators: [], styles: [], tags: [], types: [] };

/** Does a rule ask for anything at all? */
export const hasRules = (r: CollectionRules | undefined): boolean => !!r && Object.values(r).some((v) => v.length > 0);

/** What a thing is, as far as a collection's rules are concerned. */
export interface Fits {
  name: string;
  licence: string | null;
  creator: string | null;
  styles: string[];
  tags: string[];
  types: string[];
}

/** Why a thing may not go in, or null when it may. */
export function refuses(rules: CollectionRules | undefined, thing: Fits): string | null {
  if (!rules) return null;
  const has = (list: string[], values: (string | null)[]) => list.some((want) => values.some((v) => v?.toLowerCase() === want.toLowerCase()));
  if (rules.licences.length && !has(rules.licences, [thing.licence])) return 'its licence';
  if (rules.creators.length && !has(rules.creators, [thing.creator])) return 'its creator';
  if (rules.styles.length && !has(rules.styles, thing.styles)) return 'its style';
  if (rules.tags.length && !has(rules.tags, thing.tags)) return 'its tags';
  if (rules.types.length && !has(rules.types, thing.types)) return 'what kind of asset it is';
  return null;
}

export const Collection = z
  .object({
    format: z.literal(COLLECTION_FORMAT).default(COLLECTION_FORMAT),
    id: z.string().min(8),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).default(''),
    kind: z.enum(['manual', 'smart']),
    items: z.array(CollectionItem).default([]),
    /** Whole packs in the collection. Their assets come with them; they are not listed one by one. */
    packs: z.array(z.string()).default([]),
    query: SmartQuery.nullable().default(null),
    /** Only things that fit these go in. */
    rules: CollectionRules.default(() => CollectionRules.parse({})),
    /** The game this collection is for, if it is for one. */
    projectId: z.string().nullable().default(null),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type Collection = z.infer<typeof Collection>;

/** A collection as the window lists it. */
export interface CollectionSummary {
  id: string;
  name: string;
  description: string;
  kind: 'manual' | 'smart';
  /** Assets put in one by one. */
  count: number;
  /** Whole packs in it. */
  packCount: number;
  /** Every asset it holds: the loose ones and everything inside its packs. */
  assets: number;
  rules: CollectionRules;
  projectId: string | null;
  /** A few items for the cover mosaic. */
  samples: { packId: string; ref: string; ext: string; kind: string; type: string }[];
  updatedAt: string;
  query: SmartQuery | null;
}
