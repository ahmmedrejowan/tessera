import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { assetPath, baseName, kindOf, pathWords } from '@shared/assets';
import type { Detected, SiteRule } from '@shared/types';
import { detectLicense } from '@shared/licenses';
import { ruleFor } from '@shared/siteRules';
import { sourceFromName, sourceFromText, sourceFromUrl, sourceInfo } from '@shared/sources';
import { readPackFile, type PackFile } from '../index/files';
import { PACK_DIRS } from './layout';

export type { Detected };

const TEXT_MAX = 256 * 1024;
/** Readmes and licenses are usually at the top of a download: prefer shallow, license-named files. */
const rank = (ref: string) => (/licen[cs]e|copying/i.test(baseName(ref)) ? 0 : /readme|credits?|attribution/i.test(baseName(ref)) ? 1 : 2) * 100 + ref.split(/[/!]/).length;
const isText = (ref: string) => {
  const name = baseName(ref).toLowerCase();
  return /\.(txt|md|html?|rtf)$/.test(name) || /^(licen[cs]e|copying|readme|credits?)$/.test(name);
};
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;

/** A pack's license and readme texts, most telling first: proof files, then licenses, then readmes. */
export async function packTexts(packDir: string, files: PackFile[]): Promise<{ from: string; text: string }[]> {
  const texts: { from: string; text: string }[] = [];
  const licenseDir = join(packDir, PACK_DIRS.license);
  for (const name of await readdir(licenseDir).catch(() => [] as string[])) {
    const p = join(licenseDir, name);
    if ((await stat(p)).size <= TEXT_MAX && isText(name)) texts.push({ from: name, text: await readFile(p, 'utf8') });
  }
  const candidates = files.filter((f) => f.size <= TEXT_MAX && isText(f.ref) && kindOf(f.ref) !== 'archive').sort((a, b) => rank(a.ref) - rank(b.ref)).slice(0, 8);
  for (const f of candidates) {
    try {
      texts.push({ from: baseName(f.ref.replace(/!/g, '/')), text: (await readPackFile(packDir, f.ref, TEXT_MAX)).toString('utf8') });
    } catch {
      // unreadable: skip
    }
  }
  return texts;
}

/**
 * License files that sit inside the pack rather than at its top: a bundle often holds folders that
 * came under different terms. Each one becomes a suggested rule for the folder holding it.
 */
export async function partLicenses(packDir: string, files: PackFile[]): Promise<{ path: string; license: string; from: string }[]> {
  const out: { path: string; license: string; from: string }[] = [];
  const candidates = files
    .filter((f) => f.size <= TEXT_MAX && isText(f.ref) && /licen[cs]e|copying|eula|terms/i.test(baseName(f.ref.replace(/!/g, '/'))))
    .slice(0, 40);
  for (const f of candidates) {
    const shown = assetPath(f.ref);
    const slash = shown.lastIndexOf('/');
    // A license at the top of the pack is the pack's own; only the ones inside say something new.
    if (slash < 0) continue;
    const path = shown.slice(0, slash);
    if (out.some((o) => o.path === path)) continue;
    try {
      const license = detectLicense((await readPackFile(packDir, f.ref, TEXT_MAX)).toString('utf8'));
      if (license) out.push({ path, license, from: shown });
    } catch {
      // unreadable: skip
    }
  }
  return out;
}

/** What is known about a pack before its files are read. */
interface Clues {
  /** The file or folder name it was added from. */
  downloadName?: string;
  /** The user's own rules for sites they have settled. */
  rules?: SiteRule[];
  /** The link it was downloaded from, when Tessera fetched it. */
  url?: string | null;
}

/**
 * Read a pack's license and readme files (and the name it was downloaded as) for its license,
 * the site it came from and its creator, with the user's own rules for sites they have already
 * settled. Nothing is applied: the caller shows these as suggestions.
 */
export async function detectPack(packDir: string, files: PackFile[], clues: Clues = {}): Promise<Detected> {
  const { downloadName, rules = [], url: downloadUrl } = clues;
  const out: Detected = { license: null, licenseFrom: null, licenseSure: false, site: null, url: null, creator: null };
  const texts = await packTexts(packDir, files);

  for (const { from, text } of texts) {
    const plain = text.replace(/<[^>]+>/g, ' ');
    if (!out.license) {
      const id = detectLicense(plain);
      if (id) {
        out.license = id;
        out.licenseFrom = from;
        out.licenseSure = true;
      }
    }
    if (!out.site) {
      const bySite = sourceFromText(plain);
      if (bySite) out.site = bySite.id;
    }
    if (!out.url) {
      for (const u of plain.match(URL_RE) ?? []) {
        // A site Tessera knows, or one the user has set a rule for.
        const s = sourceFromUrl(u);
        if ((s || ruleFor(rules, u)) && !/creativecommons|opensource\.org|apache\.org|\/\/(support|help|docs)\./i.test(u)) {
          out.url = u.replace(/[.,;]+$/, '');
          out.urlFrom = 'a link in the pack';
          if (s) out.site ??= s.id;
          break;
        }
      }
    }
  }

  const byName = sourceFromName(downloadName ?? '') ?? files.map((f) => sourceFromName(baseName(f.ref.split('!')[0]!))).find(Boolean) ?? null;
  out.site ??= byName?.id ?? null;
  // Kenney names its downloads after the asset page: kenney_mini-arcade.zip is kenney.nl/assets/mini-arcade.
  const slug = /^kenney[_-]([a-z0-9]+(?:-[a-z0-9]+)*)(?:[_-]\d+(?:\.\d+)*)?\.zip$/i.exec(downloadName ?? '')?.[1];
  if (out.site === 'kenney' && slug && (!out.url || !/kenney\.nl\/assets\//i.test(out.url))) {
    out.url = `https://kenney.nl/assets/${slug.toLowerCase()}`;
    out.urlFrom = 'the file name';
  }
  // The link it was fetched from, when the pack's own files didn't give one.
  if (!out.url && downloadUrl) {
    out.url = downloadUrl;
    out.urlFrom = 'the link you downloaded it from';
    out.site ??= sourceFromUrl(downloadUrl)?.id ?? null;
  }
  const info = sourceInfo(out.site);
  out.creator = info?.creator ?? null;
  // What the user has settled about this site themselves: it beats what the site usually carries.
  const rule = ruleFor(rules, out.url) ?? ruleFor(rules, info?.url);
  if (rule?.creator) out.creator = rule.creator;
  if (rule?.license && !out.licenseSure) {
    out.license = rule.license;
    out.licenseFrom = `your rule for ${rule.host}`;
    out.licenseSure = true;
  }
  // A known site's usual license, when the files didn't say: free sites only, never a paid store.
  if (!out.license && info?.license) {
    out.license = info.license;
    out.licenseFrom = `${info.name} (usual license)`;
  }
  return out;
}

/** A readable pack name from a download's file name: "kenney_city-kit-roads_2.0.zip" → "City Kit Roads". */
export function nameFromDownload(fileName: string): string {
  let n = fileName.replace(/\.(zip|7z|rar|tar\.gz|tgz|unitypackage)$/i, '');
  n = n.replace(/^(kenney|kaykit|quaternius)[_\- ]+/i, '');
  n = n.replace(/[_\- ]\(?(free|lite|demo)\)?$/i, '').replace(/[_\- ]v?\d+(\.\d+)+$/i, '').replace(/[_\- ]\(\d+\)$/, '');
  const spaced = n.replace(/[_-]+/g, ' ');
  // Short runs of capitals were meant that way: a folder called UI should not come back as "Ui",
  // nor PBR as "Pbr". Anything longer is a shout, and gets tidied like the rest.
  const shouted = new Set(
    spaced
      .split(/\s+/)
      .filter((w) => /^[A-Z0-9]{2,5}$/.test(w) && /[A-Z]/.test(w))
      .map((w) => w.toLowerCase()),
  );
  const words = pathWords(spaced).split(' ').filter(Boolean);
  const small = new Set(['a', 'an', 'and', 'of', 'the', 'in', 'on', 'for', 'to']);
  return (
    words
      .map((w, i) => (shouted.has(w) ? w.toUpperCase() : i > 0 && small.has(w) ? w : /^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ') || fileName
  );
}
