import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { baseName, kindOf, pathWords } from '@shared/assets';
import type { Detected, SiteRule } from '@shared/types';
import { detectLicence } from '@shared/licences';
import { ruleFor } from '@shared/siteRules';
import { sourceFromName, sourceFromText, sourceFromUrl, sourceInfo } from '@shared/sources';
import { readPackFile, type PackFile } from '../index/files';
import { PACK_DIRS } from './layout';

export type { Detected };

const TEXT_MAX = 256 * 1024;
/** Readmes and licences are usually at the top of a download: prefer shallow, licence-named files. */
const rank = (ref: string) => (/licen[cs]e|copying/i.test(baseName(ref)) ? 0 : /readme|credits?|attribution/i.test(baseName(ref)) ? 1 : 2) * 100 + ref.split(/[/!]/).length;
const isText = (ref: string) => {
  const name = baseName(ref).toLowerCase();
  return /\.(txt|md|html?|rtf)$/.test(name) || /^(licen[cs]e|copying|readme|credits?)$/.test(name);
};
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;

/** A pack's licence and readme texts, most telling first: proof files, then licences, then readmes. */
export async function packTexts(packDir: string, files: PackFile[]): Promise<{ from: string; text: string }[]> {
  const texts: { from: string; text: string }[] = [];
  const licenceDir = join(packDir, PACK_DIRS.licence);
  for (const name of await readdir(licenceDir).catch(() => [] as string[])) {
    const p = join(licenceDir, name);
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
 * Read a pack's licence and readme files (and the name it was downloaded as) for its licence,
 * the site it came from and its creator, with the user's own rules for sites they have already
 * settled. Nothing is applied: the caller shows these as suggestions.
 */
export async function detectPack(packDir: string, files: PackFile[], clues: Clues = {}): Promise<Detected> {
  const { downloadName, rules = [], url: downloadUrl } = clues;
  const out: Detected = { licence: null, licenceFrom: null, licenceSure: false, site: null, url: null, creator: null };
  const texts = await packTexts(packDir, files);

  for (const { from, text } of texts) {
    const plain = text.replace(/<[^>]+>/g, ' ');
    if (!out.licence) {
      const id = detectLicence(plain);
      if (id) {
        out.licence = id;
        out.licenceFrom = from;
        out.licenceSure = true;
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
  if (rule?.licence && !out.licenceSure) {
    out.licence = rule.licence;
    out.licenceFrom = `your rule for ${rule.host}`;
    out.licenceSure = true;
  }
  // A known site's usual licence, when the files didn't say: free sites only, never a paid store.
  if (!out.licence && info?.licence) {
    out.licence = info.licence;
    out.licenceFrom = `${info.name} (usual licence)`;
  }
  return out;
}

/** A readable pack name from a download's file name: "kenney_city-kit-roads_2.0.zip" → "City Kit Roads". */
export function nameFromDownload(fileName: string): string {
  let n = fileName.replace(/\.(zip|7z|rar|tar\.gz|tgz|unitypackage)$/i, '');
  n = n.replace(/^(kenney|kaykit|quaternius)[_\- ]+/i, '');
  n = n.replace(/[_\- ]\(?(free|lite|demo)\)?$/i, '').replace(/[_\- ]v?\d+(\.\d+)+$/i, '').replace(/[_\- ]\(\d+\)$/, '');
  const words = pathWords(n.replace(/[_-]+/g, ' ')).split(' ').filter(Boolean);
  const small = new Set(['a', 'an', 'and', 'of', 'the', 'in', 'on', 'for', 'to']);
  return words.map((w, i) => (i > 0 && small.has(w) ? w : /^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ') || fileName;
}
