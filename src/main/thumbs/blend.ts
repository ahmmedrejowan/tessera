/**
 * The picture Blender already saved inside a .blend file.
 *
 * A .blend holds a small thumbnail of the last view, in a block called `TEST`, if the file was
 * saved with preview images on, which is Blender's default. Reading it costs a decompress of the
 * first part of the file and no Blender at all, which is the difference between previewing
 * .blend files for everyone and previewing them only for people who have Blender installed.
 *
 * Blender 3.0 onwards compresses with zstd by default, so the file usually has to be unpacked a
 * little way first. Node can do that on its own.
 */
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createZstdDecompress } from 'node:zlib';

/** Enough of the file to hold the header and the thumbnail, which live near the front. */
const LOOK_AT = 2 * 1024 * 1024;
/** Blender's own thumbnails are small; anything outside this is not one. */
const MIN = 16;
const MAX = 1024;

export interface BlendThumbnail {
  width: number;
  height: number;
  /** Rows top to bottom, RGBA. Blender stores them bottom to top; this has been turned over. */
  rgba: Buffer;
}

/** The first part of the file, unpacked if it needs to be. */
async function head(path: string): Promise<Buffer> {
  const raw = await readFile(path).catch(() => null);
  if (!raw) return Buffer.alloc(0);
  if (raw.subarray(0, 7).toString() === 'BLENDER') return raw.subarray(0, LOOK_AT);
  // Compressed. Unpacking stops as soon as there is enough to look at.
  return await new Promise<Buffer>((resolve) => {
    const parts: Buffer[] = [];
    let got = 0;
    let done = false;
    const dec = createZstdDecompress();
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(parts));
    };
    dec.on('data', (c: Buffer) => {
      parts.push(c);
      got += c.length;
      if (got >= LOOK_AT) {
        dec.destroy();
        finish();
      }
    });
    dec.on('end', finish);
    dec.on('close', finish);
    dec.on('error', finish);
    createReadStream(path).pipe(dec);
  });
}

/**
 * The thumbnail, or null when the file was saved without one.
 *
 * The block's header has changed shape between Blender versions, so rather than parsing it the
 * width and height are looked for just after the marker: the first pair that could be a picture,
 * and that is followed by exactly as many pixels as it claims, is the one.
 */
export async function readBlendThumbnail(path: string): Promise<BlendThumbnail | null> {
  const b = await head(path);
  if (b.length < 32 || b.subarray(0, 7).toString() !== 'BLENDER') return null;
  const at = b.indexOf('TEST');
  if (at < 0) return null;

  for (let off = at + 8; off <= at + 48; off += 4) {
    if (off + 8 > b.length) break;
    const width = b.readInt32LE(off);
    const height = b.readInt32LE(off + 4);
    if (width < MIN || width > MAX || height < MIN || height > MAX) continue;
    const start = off + 8;
    const bytes = width * height * 4;
    if (start + bytes > b.length) continue;
    // Turned the right way up, because Blender writes the bottom row first.
    const rgba = Buffer.alloc(bytes);
    const row = width * 4;
    for (let y = 0; y < height; y++) b.copy(rgba, y * row, start + (height - 1 - y) * row, start + (height - y) * row);
    return { width, height, rgba };
  }
  return null;
}
