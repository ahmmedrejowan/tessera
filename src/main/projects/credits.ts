import { licenseInfo } from '@shared/licenses';
import type { ManifestEntry } from '@shared/project';
import { writeFileAtomic } from '../fsx';

interface PackCredit {
  name: string;
  creator: string | null;
  license: string | null;
  attribution: string | null;
  url: string | null;
  assets: number;
}

/**
 * The game's credits for the assets it uses, grouped by pack. Packs whose license asks for credit
 * come first, with their credit line; the rest are listed as thanks.
 */
export function creditsMarkdown(entries: ManifestEntry[]): string {
  const packs = new Map<string, PackCredit>();
  for (const e of entries) {
    const p = packs.get(e.packId) ?? { name: e.packName, creator: e.creator, license: e.license, attribution: e.attribution, url: e.sourceUrl, assets: 0 };
    p.assets++;
    packs.set(e.packId, p);
  }
  const all = [...packs.values()].sort((a, b) => a.name.localeCompare(b.name));
  const needs = all.filter((p) => licenseInfo(p.license)?.attribution || licenseInfo(p.license)?.shareAlike);
  const rest = all.filter((p) => !needs.includes(p));
  /**
   * One line per pack: what it is, then the credit its license asks for.
   *
   * A credit line the creator supplied is used word for word, because that is what the license
   * asks for, but it is added to the pack's name rather than put in its place: two packs sharing
   * a creator's stock credit line used to come out as two identical lines that named neither.
   */
  const line = (p: PackCredit) => {
    const info = licenseInfo(p.license);
    // Whole words. A substring test dropped the license from "Art by John Smith", because "Smith"
    // contains "MIT", and from any creator called Fabian or Wolfley for the same reason.
    const has = (s: string | null | undefined) => {
      if (!s || !p.attribution) return false;
      const word = s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}])${word}([^\\p{L}\\p{N}]|$)`, 'iu').test(p.attribution);
    };
    // A credit line the creator supplied is used word for word, and the pack's name and license
    // are added only where it does not already carry them. Without that, two packs sharing one
    // creator's stock line came out as two identical lines naming neither.
    const what = has(p.name) ? '' : `“${p.name}”`;
    // A supplied credit line is set off with a dash, because it is somebody else's sentence;
    // "by Creator" reads as part of the same one.
    const who = p.attribution ? `${what ? ': ' : ''}${p.attribution}` : p.creator ? `${what ? ' ' : ''}by ${p.creator}` : '';
    const license = info ? (info.url ? `[${info.short}](${info.url})` : info.short) : 'license not recorded';
    const saysLicense = has(info?.short) || has(info?.name);
    const url = p.url && !has(p.url) ? ` ${p.url}` : '';
    return `- ${what}${who}${saysLicense ? '' : ` (${license})`}${url}`;
  };
  const out = ['# Credits', '', 'Assets used in this game.', ''];
  if (needs.length) out.push('## Credit required', '', ...needs.map(line), '');
  if (rest.length) out.push(needs.length ? '## Also used' : '## Assets', '', ...rest.map(line), '');
  if (!all.length) out.push('No assets copied yet.', '');
  out.push('<!-- Written by Tessera from .tessera/manifest.json. Edits here are replaced; change the pack in Tessera instead. -->', '');
  return out.join('\n');
}

export const writeCredits = (path: string, entries: ManifestEntry[]) => writeFileAtomic(path, creditsMarkdown(entries));
