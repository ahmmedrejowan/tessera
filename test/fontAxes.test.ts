import { describe, expect, it } from 'vitest';
import { readAxes, variationSettings } from '../src/renderer/src/viewer/fontAxes';

/** A minimal font file: the sfnt header, an fvar table with the given axes, and a name table. */
function fontWith(axes: { tag: string; min: number; def: number; max: number; nameId: number }[], names: Record<number, string>): ArrayBuffer {
  const fvarLen = 16 + axes.length * 20;
  const nameRecords = Object.entries(names);
  const strings = nameRecords.map(([, s]) => s);
  const nameLen = 6 + nameRecords.length * 12 + strings.reduce((n, s) => n + s.length * 2, 0);
  const tablesStart = 12 + 2 * 16;
  const buf = new ArrayBuffer(tablesStart + fvarLen + nameLen);
  const v = new DataView(buf);
  const tag = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  v.setUint32(0, 0x00010000);
  v.setUint16(4, 2);
  tag(12, 'fvar');
  v.setUint32(20, tablesStart);
  tag(28, 'name');
  v.setUint32(36, tablesStart + fvarLen);
  const f = tablesStart;
  v.setUint16(f + 4, 16);
  v.setUint16(f + 8, axes.length);
  v.setUint16(f + 10, 20);
  axes.forEach((a, i) => {
    const o = f + 16 + i * 20;
    tag(o, a.tag);
    v.setInt32(o + 4, a.min * 65536);
    v.setInt32(o + 8, a.def * 65536);
    v.setInt32(o + 12, a.max * 65536);
    v.setUint16(o + 18, a.nameId);
  });
  const n = tablesStart + fvarLen;
  v.setUint16(n + 2, nameRecords.length);
  v.setUint16(n + 4, 6 + nameRecords.length * 12);
  let offset = 0;
  nameRecords.forEach(([id, s], i) => {
    const r = n + 6 + i * 12;
    v.setUint16(r, 3);
    v.setUint16(r + 6, Number(id));
    v.setUint16(r + 8, s.length * 2);
    v.setUint16(r + 10, offset);
    [...s].forEach((c, j) => v.setUint16(n + 6 + nameRecords.length * 12 + offset + j * 2, c.charCodeAt(0)));
    offset += s.length * 2;
  });
  return buf;
}

describe('font axes', () => {
  it('reads standard and custom axes with their ranges', () => {
    const font = fontWith(
      [
        { tag: 'wght', min: 100, def: 400, max: 900, nameId: 256 },
        { tag: 'SOFT', min: 0, def: 50, max: 100, nameId: 257 },
      ],
      { 256: 'Weight', 257: 'Softness' },
    );
    expect(readAxes(font)).toEqual([
      { tag: 'wght', name: 'Weight', min: 100, value: 400, max: 900 },
      { tag: 'SOFT', name: 'Softness', min: 0, value: 50, max: 100 },
    ]);
  });

  it('finds nothing in static fonts or other files', () => {
    expect(readAxes(new ArrayBuffer(64))).toEqual([]);
    expect(readAxes(new TextEncoder().encode('wOFF....').buffer)).toEqual([]);
  });

  it('writes CSS variation settings', () => {
    expect(variationSettings({ wght: 650.333, SOFT: 10 })).toBe('"wght" 650.33, "SOFT" 10');
    expect(variationSettings({})).toBe('normal');
  });
});
