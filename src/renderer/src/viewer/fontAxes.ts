/**
 * Variation axes of a variable font (TrueType/OpenType `fvar` table): weight, width, slant and any
 * custom ones, with their ranges. Empty for static fonts or compressed (WOFF) files.
 */

export interface FontAxis {
  tag: string;
  name: string;
  min: number;
  max: number;
  value: number;
}

const STANDARD: Record<string, string> = { wght: 'Weight', wdth: 'Width', ital: 'Italic', slnt: 'Slant', opsz: 'Optical size', GRAD: 'Grade' };

const tagAt = (v: DataView, o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
const fixed = (v: DataView, o: number) => v.getInt32(o) / 65536;

function tables(v: DataView): Map<string, number> {
  const out = new Map<string, number>();
  const count = v.getUint16(4);
  for (let i = 0; i < count; i++) out.set(tagAt(v, 12 + i * 16), v.getUint32(12 + i * 16 + 8));
  return out;
}

/** A string from the `name` table (Windows or Unicode platform, UTF-16BE). */
function nameOf(v: DataView, nameTable: number | undefined, id: number): string | null {
  if (nameTable === undefined) return null;
  const count = v.getUint16(nameTable + 2);
  const strings = nameTable + v.getUint16(nameTable + 4);
  for (let i = 0; i < count; i++) {
    const r = nameTable + 6 + i * 12;
    const platform = v.getUint16(r);
    if (v.getUint16(r + 6) !== id || (platform !== 3 && platform !== 0)) continue;
    const length = v.getUint16(r + 8);
    const offset = strings + v.getUint16(r + 10);
    let s = '';
    for (let j = 0; j < length; j += 2) s += String.fromCharCode(v.getUint16(offset + j));
    return s;
  }
  return null;
}

export function readAxes(buffer: ArrayBuffer): FontAxis[] {
  try {
    const v = new DataView(buffer);
    const version = v.getUint32(0);
    // TrueType (0x00010000) or OpenType CFF ('OTTO'); WOFF and collections aren't read.
    if (version !== 0x00010000 && version !== 0x4f54544f) return [];
    const t = tables(v);
    const fvar = t.get('fvar');
    if (fvar === undefined) return [];
    const axesOffset = fvar + v.getUint16(fvar + 4);
    const count = v.getUint16(fvar + 8);
    const size = v.getUint16(fvar + 10);
    const out: FontAxis[] = [];
    for (let i = 0; i < count; i++) {
      const o = axesOffset + i * size;
      const tag = tagAt(v, o);
      out.push({ tag, name: STANDARD[tag] ?? nameOf(v, t.get('name'), v.getUint16(o + 18)) ?? tag, min: fixed(v, o + 4), value: fixed(v, o + 8), max: fixed(v, o + 12) });
    }
    return out;
  } catch {
    return [];
  }
}

/** CSS `font-variation-settings` for chosen axis values. */
export const variationSettings = (values: Record<string, number>) =>
  Object.entries(values)
    .map(([tag, v]) => `"${tag}" ${Math.round(v * 100) / 100}`)
    .join(', ') || 'normal';
