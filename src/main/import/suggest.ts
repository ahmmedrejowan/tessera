import { baseName, kindOf, pathWords } from '@shared/assets';
import type { PackSuggestions } from '@shared/types';
import type { PackFile } from '../index/files';

/** What a pack's files and download name suggest beyond its licence and source. */
interface Input {
  files: PackFile[];
  /** Licence and readme texts, most telling first (from `packTexts`). */
  texts: { from: string; text: string }[];
  /** The file or folder name it was added from. */
  downloadName: string;
}

const STYLES: [RegExp, string][] = [
  [/\b(pixel[- ]?art|pixel|8[- ]?bit|16[- ]?bit|1[- ]?bit)\b/i, 'Pixel art'],
  [/\blow[- ]?poly\b/i, 'Low poly'],
  [/\bvoxel/i, 'Voxel'],
  [/\bhand[- ]?painted\b/i, 'Hand-painted'],
  [/\bisometric\b/i, 'Isometric'],
  [/\b(cartoon|toon)\b/i, 'Cartoon'],
  [/\b(pbr|realistic|photo[- ]?scanned|photogrammetry)\b/i, 'Realistic'],
  [/\b(sci[- ]?fi)\b/i, 'Sci-fi'],
];

/** Words that say nothing about what a pack is. */
const GENERIC = new Set(
  'asset assets pack packs kit kits free file files folder format formats model models texture textures sprite sprites image images sound sounds audio music font fonts preview previews sample samples example examples demo readme license licence credits source sources original originals misc other extra extras version final new old copy default png jpg jpeg webp svg gif tga psd fbx obj glb gltf mtl blend ogg wav mp3 flac ttf otf zip unity unitypackage godot unreal www com net http https kenney kaykit quaternius tile tiles'.split(' '),
);

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const stripExt = (n: string) => n.replace(/\.(zip|7z|rar|tar\.gz|tgz|unitypackage)$/i, '');

/**
 * Details worth filling in for the user, each with where it came from: `sure` when it was read
 * from the pack's own words, otherwise a guess to check.
 */
export function suggestDetails({ files, texts, downloadName }: Input): PackSuggestions {
  const out: PackSuggestions = {};

  // "Mini Arcade (1.2)" as the first line of a licence file: the pack's own name and version.
  for (const { from, text } of texts) {
    if (!/licen[cs]e/i.test(from)) continue;
    const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
    const m = /^(.{2,80}?)\s*\((\d+(?:\.\d+)*)\)$/.exec(first);
    if (m) {
      out.name = { value: m[1]!, from, sure: true };
      out.version = { value: m[2]!, from, sure: true };
    }
    const by = /(?:created|made|distributed)(?:\s*\/\s*distributed)?\s+by\s+([^\n(]{2,60}?)\s*(?:\(|\r?\n|$)/i.exec(text);
    if (by && !out.creator) out.creator = { value: by[1]!.trim(), from, sure: true };
    if (out.name) break;
  }

  // A version at the end of the download's name: "forest_sprites_v2.zip", "city-kit_2.0.zip".
  if (!out.version) {
    const n = stripExt(downloadName);
    const m = /(?:^|[_\- ])v(\d+(?:\.\d+)*)$/i.exec(n) ?? /[_\- ](\d+\.\d+(?:\.\d+)*)$/.exec(n);
    if (m) out.version = { value: m[1]!, from: 'the file name', sure: false };
  }

  // A readme's first paragraph of prose, or a line on what's inside.
  const readme = texts.find((t) => /readme|about|description/i.test(t.from));
  const para = readme?.text
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .find((p) => p.length >= 30 && p.length <= 400 && /[a-z]{3,}\s+[a-z]{3,}/i.test(p) && !/licen[cs]e|copyright|https?:\/\//i.test(p));
  if (para && readme) out.description = { value: para, from: readme.from, sure: true };
  else {
    const byKind = new Map<string, { names: Set<string>; exts: Map<string, number> }>();
    for (const f of files) {
      const kind = kindOf(f.ref);
      if (!['model', 'image', 'audio', 'font'].includes(kind)) continue;
      const name = baseName(f.ref).replace(/\.[^.]+$/, '').toLowerCase();
      const ext = (/\.([^.!/]+)$/.exec(f.ref)?.[1] ?? '').toUpperCase();
      const k = byKind.get(kind) ?? { names: new Set(), exts: new Map() };
      k.names.add(name);
      k.exts.set(ext, (k.exts.get(ext) ?? 0) + 1);
      byKind.set(kind, k);
    }
    const words: Record<string, [string, string?]> = { model: ['model'], image: ['image'], audio: ['sound'], font: ['font'] };
    const parts = [...byKind].filter(([k]) => words[k]).sort((a, b) => b[1].names.size - a[1].names.size);
    if (parts.length) {
      const counts = parts.map(([k, v]) => plural(v.names.size, words[k]![0]!, words[k]![1]));
      const [, lead] = parts[0]!;
      const formats = [...lead.exts].sort((a, b) => b[1] - a[1]).map(([e]) => e).filter(Boolean).slice(0, 3);
      out.description = { value: `${list(counts)}, as ${list(formats)}.`, from: 'the pack’s files', sure: false };
    }
  }

  // Style and tags from the pack's name, folders and readme.
  const folders = files.map((f) => f.ref.split(/[/!]/).slice(1, -1).join(' ')).join(' ');
  const said = `${stripExt(downloadName)} ${out.name?.value ?? ''} ${folders} ${readme?.text.slice(0, 2000) ?? ''}`.replace(/[_-]+/g, ' ');
  const styles = STYLES.filter(([re]) => re.test(said)).map(([, s]) => s);
  if (styles.length) out.styles = { value: styles.slice(0, 2), from: 'the pack’s names and readme', sure: false };

  const counts = new Map<string, number>();
  const add = (w: string, n: number) => {
    const word = w.toLowerCase();
    if (word.length < 3 || /\d/.test(word) || GENERIC.has(word) || GENERIC.has(word.replace(/s$/, ''))) return;
    counts.set(word, (counts.get(word) ?? 0) + n);
  };
  for (const w of pathWords(stripExt(downloadName).replace(/[_-]+/g, ' ')).split(' ')) add(w, 1000);
  for (const f of files) for (const seg of f.ref.split(/[/!]/).slice(1, -1)) for (const w of pathWords(seg.replace(/[_-]+/g, ' ')).split(' ')) add(w, 1);
  const styleWords = new Set(styles.join(' ').toLowerCase().split(/[\s-]+/));
  const tags = [...counts].filter(([w]) => !styleWords.has(w)).sort((a, b) => b[1] - a[1]).map(([w]) => w).slice(0, 5);
  if (tags.length) out.tags = { value: tags, from: 'the pack’s names and folders', sure: false };
  return out;
}
