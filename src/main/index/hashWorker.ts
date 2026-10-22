/**
 * A process that does nothing but work out what files contain.
 *
 * It holds no database and no library: it is handed a list of files, reads and hashes them, and
 * says what it found. Everything it does is synchronous once the bytes are in hand — parsing an
 * archive's table of contents, hashing a buffer — which is exactly why it should not happen where
 * the window is trying to answer.
 *
 * It is forked by hashPool.ts and speaks the shape in that file. If it dies, nothing is lost: the
 * batch it was given is simply done in the main process instead.
 */
import { stampOne, type StampMode } from './stamp';

interface Ask {
  batch: number;
  files: { id: number; packDir: string; ref: string; mode: StampMode }[];
}

const port = process.parentPort;

port?.on('message', (e) => {
  const ask = e.data as Ask;
  void (async () => {
    const done = [];
    for (const f of ask.files) {
      try {
        const stamp = await stampOne(f.packDir, f.ref, f.mode);
        done.push({ id: f.id, ok: true as const, stamp });
      } catch (err) {
        done.push({ id: f.id, ok: false as const, error: err instanceof Error ? err.message : String(err) });
      }
    }
    port.postMessage({ batch: ask.batch, done });
  })();
});
