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
  /** A few items for the cover mosaic. */
  samples: { packId: string; ref: string; ext: string; kind: string; type: string }[];
  updatedAt: string;
  query: SmartQuery | null;
}
