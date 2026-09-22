import { licenceInfo } from '@shared/licences';
import type { ManifestEntry } from '@shared/project';
import { writeFileAtomic } from '../fsx';

interface PackCredit {
  name: string;
  creator: string | null;
  licence: string | null;
  attribution: string | null;
  url: string | null;
  assets: number;
}

/**
 * The game's credits for the assets it uses, grouped by pack. Packs whose licence asks for credit
 * come first, with their credit line; the rest are listed as thanks.
 */
export function creditsMarkdown(entries: ManifestEntry[]): string {
  const packs = new Map<string, PackCredit>();
  for (const e of entries) {
    const p = packs.get(e.packId) ?? { name: e.packName, creator: e.creator, licence: e.licence, attribution: e.attribution, url: e.sourceUrl, assets: 0 };
    p.assets++;
    packs.set(e.packId, p);
  }
  const all = [...packs.values()].sort((a, b) => a.name.localeCompare(b.name));
  const needs = all.filter((p) => licenceInfo(p.licence)?.attribution || licenceInfo(p.licence)?.shareAlike);
  const rest = all.filter((p) => !needs.includes(p));
  const line = (p: PackCredit) => {
    const info = licenceInfo(p.licence);
    const credit = p.attribution ?? `“${p.name}”${p.creator ? ` by ${p.creator}` : ''}`;
    const licence = info ? (info.url ? `[${info.short}](${info.url})` : info.short) : 'licence not recorded';
    return `- ${credit}${p.attribution ? '' : ` — ${licence}`}${p.url && !p.attribution?.includes(p.url) ? ` — ${p.url}` : ''}`;
  };
  const out = ['# Credits', '', 'Assets used in this game.', ''];
  if (needs.length) out.push('## Credit required', '', ...needs.map(line), '');
  if (rest.length) out.push(needs.length ? '## Also used' : '## Assets', '', ...rest.map(line), '');
  if (!all.length) out.push('No assets copied yet.', '');
  out.push('<!-- Written by Tessera from .tessera/manifest.json. Edits here are replaced; change the pack in Tessera instead. -->', '');
  return out.join('\n');
}

export const writeCredits = (path: string, entries: ManifestEntry[]) => writeFileAtomic(path, creditsMarkdown(entries));
