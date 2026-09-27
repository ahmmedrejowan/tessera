import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readBlendThumbnail } from '../src/main/thumbs/blend';
import { tempDir } from './helpers';

/** A .blend as Blender writes one: header, a block or two, then the TEST block with the picture. */
function fakeBlend(width: number, height: number, { compress = false, withThumb = true } = {}) {
  const head = Buffer.from('BLENDER-v403', 'latin1');
  const rend = Buffer.concat([Buffer.from('REND', 'latin1'), Buffer.alloc(20)]);
  const pixels = Buffer.alloc(width * height * 4);
  // The bottom row is marked, so the turn-over can be checked.
  pixels.writeUInt32LE(0xff0000ff, 0);
  const test = Buffer.concat([
    Buffer.from('TEST', 'latin1'),
    Buffer.alloc(16),
    (() => { const b = Buffer.alloc(8); b.writeInt32LE(width, 0); b.writeInt32LE(height, 4); return b; })(),
    pixels,
  ]);
  const raw = withThumb ? Buffer.concat([head, rend, test]) : Buffer.concat([head, rend]);
  const file = join(tempDir(), `thing.blend`);
  writeFileSync(file, compress ? zstdCompressSync(raw) : raw);
  return file;
}

describe('the picture inside a .blend', () => {
  it('reads one out of an ordinary file', async () => {
    const t = await readBlendThumbnail(fakeBlend(64, 64));
    expect(t).toMatchObject({ width: 64, height: 64 });
    expect(t!.rgba.length).toBe(64 * 64 * 4);
  });

  it('reads one out of a compressed file, which is what Blender writes now', async () => {
    const t = await readBlendThumbnail(fakeBlend(32, 32, { compress: true }));
    expect(t).toMatchObject({ width: 32, height: 32 });
  });

  it('turns it the right way up', async () => {
    const t = await readBlendThumbnail(fakeBlend(32, 32));
    // Blender writes the bottom row first, so the marked row must end up at the bottom.
    expect(t!.rgba.readUInt32LE((32 - 1) * 32 * 4)).toBe(0xff0000ff);
  });

  it('says nothing rather than guessing when the file was saved without one', async () => {
    expect(await readBlendThumbnail(fakeBlend(64, 64, { withThumb: false }))).toBeNull();
  });

  it('is not upset by something that is not a .blend at all', async () => {
    const file = join(tempDir(), 'not.blend');
    writeFileSync(file, 'hello');
    expect(await readBlendThumbnail(file)).toBeNull();
    expect(await readBlendThumbnail('/nowhere/at/all.blend')).toBeNull();
  });
});
