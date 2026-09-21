import { randomUUID } from 'node:crypto';
import type { Job } from '@shared/types';
import { log } from './log';

/**
 * Background work the user should know about (indexing, importing, making previews). Each change
 * is pushed to the window; finished jobs linger briefly so the indicator can show "done".
 */
export class Jobs {
  private readonly jobs = new Map<string, Job>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly publish: (jobs: Job[]) => void) {}

  list(): Job[] {
    return [...this.jobs.values()];
  }

  start(label: string, detail = ''): JobHandle {
    const job: Job = { id: randomUUID(), label, detail, progress: null, state: 'running' };
    this.jobs.set(job.id, job);
    this.changed();
    return new JobHandle(job, () => this.changed(), () => this.finish(job.id));
  }

  /** Run `fn` as a job, marking it done or failed. */
  async run<T>(label: string, fn: (job: JobHandle) => Promise<T>): Promise<T> {
    const job = this.start(label);
    try {
      const out = await fn(job);
      job.done();
      return out;
    } catch (e) {
      job.fail(e);
      throw e;
    }
  }

  private finish(id: string): void {
    this.changed();
    setTimeout(() => {
      this.jobs.delete(id);
      this.changed();
    }, 4000);
  }

  /** Changes are batched so a fast loop doesn't flood the window. */
  private changed(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.publish(this.list());
    }, 100);
  }
}

export class JobHandle {
  constructor(
    private readonly job: Job,
    private readonly changed: () => void,
    private readonly finished: () => void,
  ) {}

  update(progress: number | null, detail?: string): void {
    this.job.progress = progress === null ? null : Math.max(0, Math.min(1, progress));
    if (detail !== undefined) this.job.detail = detail;
    this.changed();
  }

  done(detail?: string): void {
    this.job.state = 'done';
    this.job.progress = 1;
    if (detail !== undefined) this.job.detail = detail;
    this.finished();
  }

  fail(e: unknown): void {
    this.job.state = 'failed';
    this.job.error = e instanceof Error ? e.message : String(e);
    log.error('jobs', `${this.job.label} failed`, e);
    this.finished();
  }
}
