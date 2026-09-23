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
    purchase: PackPurchase.nullable().default(null),
    version: shortText.nullable().default(null),
    description: text.default(''),
    notes: text.default(''),
    genres: list.default([]),
    styles: list.default([]),
    tags: list.default([]),
    /** Path (inside the pack) of the file shown as the pack's cover; null picks one automatically. */
    cover: z.string().nullable().default(null),
  })
  .passthrough();
export type PackMeta = z.infer<typeof PackMeta>;

/** The fields a user can change; everything else is managed by the app. */
export const PackEdit = PackMeta.pick({
  name: true,
  source: true,
  licence: true,
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

/** What still stands between a pack and the library: empty when it may leave the Inbox. */
export function missingForLibrary(meta: Pick<PackMeta, 'licence' | 'source'>): ('licence' | 'source')[] {
  const missing: ('licence' | 'source')[] = [];
  if (!meta.licence.id) missing.push('licence');
  if (!meta.source.site && !meta.source.name && !meta.source.url) missing.push('source');
  return missing;
}
