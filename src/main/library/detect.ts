import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { baseName, kindOf, pathWords } from '@shared/assets';
import type { Detected } from '@shared/types';
import { detectLicence } from '@shared/licences';
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

/**
 * Read a pack's licence and readme files (and the name it was downloaded as) for its licence,
 * the site it came from and its creator. Nothing is applied: the caller shows these as suggestions.
 */
export async function detectPack(packDir: string, files: PackFile[], downloadName?: string): Promise<Detected> {
  const out: Detected = { licence: null, licenceFrom: null, site: null, url: null, creator: null };

  // Proof files the user saved beside the pack come first.
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

  for (const { from, text } of texts) {
    const plain = text.replace(/<[^>]+>/g, ' ');
    if (!out.licence) {
      const id = detectLicence(plain);
      if (id) {
        out.licence = id;
        out.licenceFrom = from;
      }
    }
    if (!out.site) {
      const bySite = sourceFromText(plain);
      if (bySite) out.site = bySite.id;
    }
    if (!out.url) {
      for (const u of plain.match(URL_RE) ?? []) {
        const s = sourceFromUrl(u);
        // A link to the site itself, not to a licence page.
        if (s && !/creativecommons|opensource\.org|apache\.org/.test(u)) {
          out.url = u.replace(/[.,;]+$/, '');
          out.site ??= s.id;
          break;
        }
      }
    }
  }

  const byName = sourceFromName(downloadName ?? '') ?? files.map((f) => sourceFromName(baseName(f.ref.split('!')[0]!))).find(Boolean) ?? null;
  out.site ??= byName?.id ?? null;
  const info = sourceInfo(out.site);
  out.creator = info?.creator ?? null;
  // A known site's usual licence, when the files didn't say — free sites only, never a paid store.
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
