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

export const PackLicense = z.object({
  /** An id from `LICENSES`, or null while unknown. */
  id: z.string().nullable().default(null),
  /** The credit line to use in a game's credits, when the license asks for one. */
  attribution: shortText.nullable().default(null),
  /** Files in the pack's `license/` folder that prove it: license text, receipt, screenshot. */
  proof: z.array(z.string()).default([]),
  notes: text.default(''),
});
export type PackLicense = z.infer<typeof PackLicense>;

/**
 * A license for part of a pack. Bundles often ship a folder with terms of its own, so a rule says
 * "everything under this path is licensed like this" and the most exact rule for a file wins.
 */
export const PackLicenseRule = z.object({
  /** A folder or a single file inside the pack, as it is shown (no `original/`, archives as folders). */
  path: z.string().trim().min(1).max(400),
  license: PackLicense,
});
export type PackLicenseRule = z.infer<typeof PackLicenseRule>;

export const PackPurchase = z.object({
  price: z.number().nonnegative().nullable().default(null),
  currency: z.string().trim().max(8).nullable().default(null),
  orderId: shortText.nullable().default(null),
  date: z.string().nullable().default(null),
});

/**
 * A pack whose files were never brought into the library: they stay where their owner keeps them
 * and Tessera only reads them. The record, the license proof and everything else still live in
 * the library, so they are backed up and synced; the files are not, because they are not here.
 *
 * Tessera never writes inside `where`. Not a preview, not a license file, not a note. That is
 * what makes this safe to point at a read-only drive, a network share, or a game somebody ships.
 */
export const PackKept = z.object({
  /** Absolute path of the folder the files are read from, as its owner chose it. */
  where: z.string().min(1),
  since: z.string(),
  /** The volume it was on, so "plug in Samsung T7" beats "the folder could not be found". */
  volume: z.string().nullable().default(null),
});
export type PackKept = z.infer<typeof PackKept>;

/**
 * Records written before the spelling was settled say `license` and `licenses`. Read either, keep
 * the American one, and the next save quietly moves the file over. Nobody has to migrate anything
 * and an older Tessera can still read what this one writes, because the old keys are left alone.
 */
export const eitherSpelling = (o: unknown): unknown => {
  if (!o || typeof o !== 'object') return o;
  const r = o as Record<string, unknown>;
  const out = { ...r };
  // The old key, written out so a spelling sweep cannot quietly turn it into the new one and make
  // this function a no-op that still looks right.
  const wasLicense = 'licence';
  const wasLicenses = 'licences';
  if (out.license === undefined && r[wasLicense] !== undefined) out.license = r[wasLicense];
  const rules = out.licenses ?? r[wasLicenses];
  // Each part rule carries a license of its own, spelled the way the record was.
  if (Array.isArray(rules)) {
    out.licenses = rules.map((rule) => {
      if (!rule || typeof rule !== 'object') return rule;
      const one = rule as Record<string, unknown>;
      return one.license === undefined && one[wasLicense] !== undefined ? { ...one, license: one[wasLicense] } : one;
    });
  }
  return out;
};

export const PackMeta = z
  .object({
    format: z.literal(PACK_FORMAT).default(PACK_FORMAT),
    id: z.string().min(8),
    name: z.string().trim().min(1).max(200),
    status: PackStatus.default('inbox'),
    addedAt: z.string(),
    updatedAt: z.string(),
    source: PackSource.default(() => PackSource.parse({})),
    license: PackLicense.default(() => PackLicense.parse({})),
    /** Parts of the pack with terms of their own; the pack's own license covers the rest. */
    licenses: z.array(PackLicenseRule).default([]),
    purchase: PackPurchase.nullable().default(null),
    version: shortText.nullable().default(null),
    description: text.default(''),
    notes: text.default(''),
    genres: list.default([]),
    styles: list.default([]),
    tags: list.default([]),
    /** Path (inside the pack) of the file shown as the pack's cover; null picks one automatically. */
    cover: z.string().nullable().default(null),
    /** Put away: kept in full, but out of the way of browsing until it is brought back. */
    archived: z.boolean().default(false),
    /** Set when the files live outside the library and Tessera only reads them. */
    kept: PackKept.nullable().default(null),
  })
  .passthrough();
export type PackMeta = z.infer<typeof PackMeta>;

/** The fields a user can change; everything else is managed by the app. */
export const PackEdit = PackMeta.pick({
  name: true,
  source: true,
  license: true,
  licenses: true,
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
 * The license that covers one file: the most exact rule whose path contains it, or the pack's own
 * when no rule does. `path` is the file as it is shown (see `assetPath`).
 */
export function licenseForPath(meta: Pick<PackMeta, 'license' | 'licenses'>, path: string): PackLicense {
  const file = tidy(path);
  let best: PackLicenseRule | undefined;
  for (const rule of meta.licenses ?? []) {
    const at = tidy(rule.path);
    if (!at || !(file === at || file.startsWith(`${at}/`))) continue;
    if (!best || tidy(rule.path).length > tidy(best.path).length) best = rule;
  }
  return best?.license ?? meta.license;
}

/** What still stands between a pack and the library: empty when it may leave the Inbox. */
export function missingForLibrary(meta: Pick<PackMeta, 'license' | 'source'>): ('license' | 'source')[] {
  const missing: ('license' | 'source')[] = [];
  if (!meta.license.id) missing.push('license');
  if (!meta.source.site && !meta.source.name && !meta.source.url) missing.push('source');
  return missing;
}
