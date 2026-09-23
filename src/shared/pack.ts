import { z } from 'zod';

/**
 * A pack's record, stored as `pack.json` in its folder. This file is the truth about the pack: 
 * the index only mirrors it, so it is written for people too: readable keys, nothing derived.
 *
 * Unknown keys are kept on write (`passthrough`) so a newer Tessera's fields survive an older one.
 */

export const PACK_FORMAT = 1;

export const PackStatus = z.enum(['inbox', 'library']);
export type PackStatus = z.infer<typeof PackStatus>;

const text = z.string().trim().max(10_000);
const shortText = z.string().trim().max(500);
const list = z.array(z.string().trim().min(1).max(80)).max(200);

export const PackSource = z.object({
  /** A known site from `SOURCES`, or null for anything else. */
  site: z.string().nullable().default(null),
  /** Free-text name when the site isn't a known one ("A friend", "Bought at a jam"). */
  name: shortText.nullable().default(null),
  url: shortText.nullable().default(null),
  creator: shortText.nullable().default(null),
  creatorUrl: shortText.nullable().default(null),
});
export type PackSource = z.infer<typeof PackSource>;

export const PackLicence = z.object({
  /** An id from `LICENCES`, or null while unknown. */
  id: z.string().nullable().default(null),
  /** The credit line to use in a game's credits, when the licence asks for one. */
  attribution: shortText.nullable().default(null),
  /** Files in the pack's `licence/` folder that prove it: licence text, receipt, screenshot. */
  proof: z.array(z.string()).default([]),
  notes: text.default(''),
});
export type PackLicence = z.infer<typeof PackLicence>;

/**
 * A licence for part of a pack. Bundles often ship a folder with terms of its own, so a rule says
 * "everything under this path is licensed like this" and the most exact rule for a file wins.
 */
export const PackLicenceRule = z.object({
  /** A folder or a single file inside the pack, as it is shown (no `original/`, archives as folders). */
  path: z.string().trim().min(1).max(400),
  licence: PackLicence,
});
export type PackLicenceRule = z.infer<typeof PackLicenceRule>;

export const PackPurchase = z.object({
  price: z.number().nonnegative().nullable().default(null),
  currency: z.string().trim().max(8).nullable().default(null),
  orderId: shortText.nullable().default(null),
  date: z.string().nullable().default(null),
});

export const PackMeta = z
  .object({
    format: z.literal(PACK_FORMAT).default(PACK_FORMAT),
    id: z.string().min(8),
    name: z.string().trim().min(1).max(200),
    status: PackStatus.default('inbox'),
    addedAt: z.string(),
    updatedAt: z.string(),
    source: PackSource.default(() => PackSource.parse({})),
    licence: PackLicence.default(() => PackLicence.parse({})),
    /** Parts of the pack with terms of their own; the pack's own licence covers the rest. */
    licences: z.array(PackLicenceRule).default([]),
    purchase: PackPurchase.nullable().default(null),
    version: shortText.nullable().default(null),
    description: text.default(''),
    notes: text.default(''),
    genres: list.default([]),
    styles: list.default([]),
    tags: list.default([]),
    /** Path (inside the pack) of the file shown as the pack's cover; null picks one automatically. */
    cover: z.string().nullable().default(null),
    /** Starred by its owner, so it comes to hand quickly. */
    favourite: z.boolean().default(false),
    /** Put away: kept in full, but out of the way of browsing until it is brought back. */
    archived: z.boolean().default(false),
  })
  .passthrough();
export type PackMeta = z.infer<typeof PackMeta>;

/** The fields a user can change; everything else is managed by the app. */
export const PackEdit = PackMeta.pick({
  name: true,
  source: true,
  licence: true,
  licences: true,
  purchase: true,
  version: true,
  description: true,
  notes: true,
  genres: true,
  styles: true,
  tags: true,
  cover: true,
}).partial();
export type PackEdit = z.infer<typeof PackEdit>;

/** Trailing slashes off, lower case: two paths compare the same way everywhere. */
const tidy = (path: string) => path.replace(/^\/+|\/+$/g, '').toLowerCase();

/**
 * The licence that covers one file: the most exact rule whose path contains it, or the pack's own
 * when no rule does. `path` is the file as it is shown (see `assetPath`).
 */
export function licenceForPath(meta: Pick<PackMeta, 'licence' | 'licences'>, path: string): PackLicence {
  const file = tidy(path);
  let best: PackLicenceRule | undefined;
  for (const rule of meta.licences ?? []) {
    const at = tidy(rule.path);
    if (!at || !(file === at || file.startsWith(`${at}/`))) continue;
    if (!best || tidy(rule.path).length > tidy(best.path).length) best = rule;
  }
  return best?.licence ?? meta.licence;
}

/** What still stands between a pack and the library: empty when it may leave the Inbox. */
export function missingForLibrary(meta: Pick<PackMeta, 'licence' | 'source'>): ('licence' | 'source')[] {
  const missing: ('licence' | 'source')[] = [];
  if (!meta.licence.id) missing.push('licence');
  if (!meta.source.site && !meta.source.name && !meta.source.url) missing.push('source');
  return missing;
}
