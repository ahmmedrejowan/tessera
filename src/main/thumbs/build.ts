/**
 * Drawing previews on purpose, rather than waiting to scroll past them.
 *
 * Normally a preview is made the first time its tile comes into view, which is the right default:
 * nothing is spent on what nobody looks at. But before going offline, or after clearing the lot,
 * it is worth asking for a whole pack or a whole library at once. That is all this is: the same
 * queue the grid uses, fed in order, with a job to watch and a way to stop.
 */
import type { LibraryQueries } from '../index/query';
import type { JobHandle } from '../jobs';
import type { ThumbService } from './service';
import { assetKey } from '@shared/urls';

/** Asked for in batches so the queue never holds the whole library at once. */
const BATCH = 60;

export interface BuildDeps {
  queries: () => LibraryQueries | null;
  thumbs: ThumbService;
}

/** One build at a time: two would fight over the same queue and tell the user nothing useful. */
export class PreviewBuilder {
  private stopping = false;
  private running = false;

  constructor(private readonly d: BuildDeps) {}

  get busy(): boolean {
    return this.running;
  }

  /** Ask the one in flight to stop. It finishes what is already drawing and then gives up. */
  stop(): void {
    this.stopping = true;
  }

  /**
   * Draw what is missing for these packs, or for every pack when none are named.
   *
   * Returns how many files were looked at, not how many pictures were drawn: most of a library is
   * already there by the time someone asks for this, and asking for one that exists costs nothing.
   */
  async run(packs: string[] | null, job: JobHandle): Promise<{ looked: number; stopped: boolean }> {
    const queries = this.d.queries();
    if (!queries) return { looked: 0, stopped: false };
    this.running = true;
    this.stopping = false;
    try {
      const ids = packs?.length ? packs : (queries.allIds({ scope: 'all', text: '', filters: {} }, 'packs') as string[]);
      const keys: string[] = [];
      for (const id of ids) for (const ref of queries.packRefs(id)) keys.push(assetKey(id, ref));

      let looked = 0;
      for (let i = 0; i < keys.length; i += BATCH) {
        if (this.stopping) return { looked, stopped: true };
        await this.d.thumbs.get(keys.slice(i, i + BATCH));
        looked += Math.min(BATCH, keys.length - i);
        job.update(looked / keys.length, `${looked} of ${keys.length} files`);
        // Wait for the queue to come down before asking for more, so stopping is quick and the
        // grid someone is actually looking at still gets served first.
        await this.settle(BATCH / 2);
      }
      // The job is not done until the last picture is drawn: asking is not the same as drawing.
      await this.settle(0);
      return { looked, stopped: this.stopping };
    } finally {
      this.running = false;
      this.stopping = false;
    }
  }

  private async settle(down_to: number): Promise<void> {
    while (this.d.thumbs.pending > down_to && !this.stopping) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
}
