import { protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { extOf } from '@shared/assets';
import { parseRef, readPackFile } from './index/files';
import { log } from './log';

/**
 * `tessera://` serves library files to the window without exposing the file system:
 *
 *   tessera://pack/<pack id>/<ref>                a file of a pack, from disk or inside an archive;
 *                                                 each path segment is encoded on its own, so relative
 *                                                 links in a model (a .bin, an .mtl, textures) resolve
 *                                                 to the files beside it
 *   tessera://thumb/<name>                        a cached thumbnail
 *
 * Range requests are honoured so audio and video can seek.
 */

export const SCHEME = 'tessera';

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  bmp: 'image/bmp', avif: 'image/avif', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac',
  m4a: 'audio/mp4', opus: 'audio/ogg', aif: 'audio/aiff', aiff: 'audio/aiff', ttf: 'font/ttf', otf: 'font/otf',
  woff: 'font/woff', woff2: 'font/woff2', glb: 'model/gltf-binary', gltf: 'model/gltf+json', txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8', json: 'application/json', pdf: 'application/pdf',
};
const contentType = (name: string) => TYPES[extOf(name)] ?? 'application/octet-stream';

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m) return null;
  let start = m[1] ? Number(m[1]) : NaN;
  let end = m[2] ? Number(m[2]) : size - 1;
  if (Number.isNaN(start)) {
    // "bytes=-500": the last 500 bytes
    start = Math.max(0, size - end);
    end = size - 1;
  }
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function fromBuffer(buf: Buffer, type: string, range: string | null): Response {
  const r = parseRange(range, buf.length);
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  if (!r) return new Response(new Uint8Array(buf), { headers: { ...headers, 'Content-Length': String(buf.length) } });
  const part = buf.subarray(r.start, r.end + 1);
  return new Response(new Uint8Array(part), {
    status: 206,
    headers: { ...headers, 'Content-Length': String(part.length), 'Content-Range': `bytes ${r.start}-${r.end}/${buf.length}` },
  });
}

async function fromFile(path: string, type: string, range: string | null, cache = 'no-cache'): Promise<Response> {
  const size = (await stat(path)).size;
  const r = parseRange(range, size);
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache };
  const stream = (start: number, end: number) => Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  if (!r) return new Response(size ? stream(0, size - 1) : null, { headers: { ...headers, 'Content-Length': String(size) } });
  return new Response(stream(r.start, r.end), {
    status: 206,
    headers: { ...headers, 'Content-Length': String(r.end - r.start + 1), 'Content-Range': `bytes ${r.start}-${r.end}/${size}` },
  });
}

export interface ProtocolDeps {
  /** Folder of a pack by id, or null when no library is open or the pack is unknown. */
  packDir: (packId: string) => string | null;
  thumbDir: () => string | null;
}

export function handleProtocol(d: ProtocolDeps): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const range = request.headers.get('Range');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (url.host === 'pack') {
        const [packId, ...rest] = parts;
        const ref = rest.join('/');
        const dir = packId ? d.packDir(packId) : null;
        if (!dir || !ref) return new Response('Not found', { status: 404 });
        const { file, inside } = parseRef(ref);
        if (file.split('/').includes('..')) return new Response('Bad path', { status: 400 });
        if (!inside.length) return await fromFile(join(dir, ...file.split('/')), contentType(file), range);
        return fromBuffer(await readPackFile(dir, ref), contentType(inside.at(-1)!), range);
      }
      if (url.host === 'thumb') {
        const dir = d.thumbDir();
        const name = parts[0];
        if (!dir || !name || !/^[\w.-]+$/.test(name)) return new Response('Not found', { status: 404 });
        return await fromFile(join(dir, name), contentType(name), range, 'max-age=31536000, immutable');
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') log.warn('protocol', `failed: ${request.url}`, e);
      return new Response('Not found', { status: 404 });
    }
  });
}
