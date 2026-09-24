import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { writeZip } from './zipfixture';

/**
 * The one door the window has onto files: tessera://pack/<id>/<ref> and tessera://thumb/<name>.
 * Anything that gets through here is read from disk and handed to a web page, so what it refuses
 * matters as much as what it serves.
 */

// Electron is not here in a test, so the protocol registers against a stand-in that keeps the
// handler for us to call the way Chromium would.
let answer: (request: Request) => Promise<Response>;
vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: () => undefined,
    handle: (_scheme: string, fn: (request: Request) => Promise<Response>) => {
      answer = fn;
    },
  },
}));

// These stand for the whole file, not one test, so they are not the shared temporary folders.
const pack = mkdtempSync(join(tmpdir(), 'tessera-protocol-pack-'));
const thumbs = mkdtempSync(join(tmpdir(), 'tessera-protocol-thumbs-'));
afterAll(() => {
  for (const dir of [pack, thumbs]) rmSync(dir, { recursive: true, force: true });
});

beforeAll(async () => {
  mkdirSync(join(pack, 'original', 'Models'), { recursive: true });
  writeFileSync(join(pack, 'original', 'Models', 'car.obj'), 'o car\nv 0 0 0\n');
  writeFileSync(join(thumbs, 'abc123.webp'), 'a picture');
  writeFileSync(join(pack, '..', 'secret.txt'), 'not yours');
  await writeZip(join(pack, 'original', 'kit.zip'), { 'Models/tree.obj': 'o tree\n' });
  const { handleProtocol } = await import('../src/main/protocol');
  handleProtocol({ packDir: (id) => (id === 'good' ? pack : null), thumbDir: () => thumbs });
});

const get = (url: string, headers: Record<string, string> = {}) => answer(new Request(url, { headers }));

describe('serving a file from a pack', () => {
  it('serves a file that is in the pack', async () => {
    const res = await get('tessera://pack/good/original/Models/car.obj');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('o car');
  });

  it('serves a file from inside an archive without unpacking it', async () => {
    const res = await get('tessera://pack/good/original/kit.zip!Models/tree.obj');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('o tree');
  });

  it('refuses a path that climbs out of the pack', async () => {
    // A plain ../ is flattened by the address itself before it ever reaches us, and what is left
    // is not in the pack. An encoded one arrives whole, and is refused.
    expect((await get('tessera://pack/good/original/../secret.txt')).status).toBe(404);
    expect((await get('tessera://pack/good/..%2Fsecret.txt')).status).toBe(400);
  });

  it('answers 404 for a pack that is not in the open library, and for nothing at all', async () => {
    expect((await get('tessera://pack/elsewhere/original/Models/car.obj')).status).toBe(404);
    expect((await get('tessera://pack/good/')).status).toBe(404);
    expect((await get('tessera://pack/good/original/Models/missing.obj')).status).toBe(404);
  });

  it('serves the part of a file that was asked for', async () => {
    const res = await get('tessera://pack/good/original/Models/car.obj', { Range: 'bytes=0-4' });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe('o car');
    expect(res.headers.get('content-range')).toBe('bytes 0-4/14');
  });
});

describe('serving a thumbnail', () => {
  it('serves one by its name', async () => {
    const res = await get('tessera://thumb/abc123.webp');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('refuses a name with a path in it', async () => {
    expect((await get('tessera://thumb/..%2F..%2Fsecret.txt')).status).toBe(404);
    expect((await get('tessera://thumb/sub%2Fabc123.webp')).status).toBe(404);
  });
});

describe('anything else', () => {
  it('is not served', async () => {
    expect((await get('tessera://elsewhere/abc')).status).toBe(404);
  });
});
