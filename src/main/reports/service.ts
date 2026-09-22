import { createHash, randomUUID } from 'node:crypto';
import { appendFile, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ErrorInput, ErrorRecord, ReportConsent, ReportsStatus } from '@shared/types';
import { log } from '../log';
import type { SettingsStore } from '../settings';
import { envelope, parseStack, sendEnvelope, sendMinidump, toEvent, type Dsn, type Environment } from './sentry';

type Fetch = Parameters<typeof sendEnvelope>[2];

interface Deps {
  logsDir: string;
  /** Where Electron's crash reporter leaves native crash dumps. */
  crashDir: string | null;
  settings: SettingsStore;
  /** Cleans text before it's kept or sent (see scrub.ts); it depends on the open library. */
  scrub: () => (text: string) => string;
  env: Environment;
  dsn: Dsn | null;
  fetch: Fetch;
  /** Ask the window whether to send what was caught (consent is "ask"). */
  onAsk: () => void;
  onChange: () => void;
}

const MAX_SENT_PER_SESSION = 25;
const MAX_FILE = 1024 * 1024;
const CRASH_KEEP_DAYS = 30;
const ASK_DELAY = 1500;

export type Answer = 'once' | 'always' | 'never' | 'not-now';

/**
 * Errors nobody expected. Every one is kept on this computer (cleaned, in logs/errors.jsonl);
 * sending them anywhere happens only with the user's consent, and only when the build knows
 * where to send them.
 */
export class ReportService {
  private readonly records = new Map<string, ErrorRecord>();
  private readonly unsent = new Set<string>();
  private asked = false;
  private sent = 0;
  private askTimer: NodeJS.Timeout | null = null;
  private crashDumps: string[] = [];
  private recovered = false;
  private sending: Promise<void> = Promise.resolve();

  constructor(private readonly d: Deps) {
    d.settings.onChange((s) => {
      if (s.errorReports === 'always' && this.unsent.size) void this.flush();
    });
  }

  get available(): boolean {
    return !!this.d.dsn;
  }

  private get consent(): ReportConsent {
    return this.d.settings.get().errorReports;
  }

  /** Same problem, same fingerprint: its kind, its type and where in Tessera's code it happened. */
  static fingerprint(input: Pick<ErrorInput, 'source' | 'name' | 'message' | 'stack'>): string {
    const where = parseStack(input.stack)
      .filter((f) => f.in_app)
      .slice(-3)
      .map((f) => `${f.function ?? ''}@${f.filename}`)
      .join('|');
    // Without a stack, the message stands in, with numbers taken out (sizes, counts, ports).
    const what = where || input.message.replace(/\d+/g, '#');
    return createHash('sha1').update(`${input.source}|${input.name}|${what}`).digest('hex').slice(0, 16);
  }

  record(raw: ErrorInput): ErrorRecord {
    const scrub = this.d.scrub();
    const input: ErrorInput = {
      source: raw.source,
      kind: raw.kind,
      name: scrub(raw.name || 'Error').slice(0, 200),
      message: scrub(raw.message || '').slice(0, 2000),
      ...(raw.stack ? { stack: scrub(raw.stack).slice(0, 8000) } : {}),
      ...(raw.context ? { context: Object.fromEntries(Object.entries(raw.context).map(([k, v]) => [k.slice(0, 40), scrub(String(v)).slice(0, 200)])) } : {}),
    };
    const fingerprint = ReportService.fingerprint(input);
    const known = this.records.get(fingerprint);
    const record: ErrorRecord = known ? { ...known, count: known.count + 1, at: new Date().toISOString() } : { ...input, id: randomUUID(), at: new Date().toISOString(), fingerprint, count: 1, sent: false };
    this.records.set(fingerprint, record);
    if (!known) {
      void this.keep(record);
      if (!record.sent) this.unsent.add(fingerprint);
      this.consider();
    }
    this.d.onChange();
    return record;
  }

  /** Append to the local error file, starting a new one when it gets big. */
  private async keep(record: ErrorRecord): Promise<void> {
    const file = join(this.d.logsDir, 'errors.jsonl');
    try {
      if (((await stat(file).catch(() => null))?.size ?? 0) > MAX_FILE) await rename(file, join(this.d.logsDir, 'errors.old.jsonl'));
      await appendFile(file, `${JSON.stringify(record)}\n`);
    } catch (e) {
      log.warn('reports', 'could not keep an error record', e);
    }
  }

  private consider(): void {
    if (!this.available || this.consent === 'never') return;
    if (this.consent === 'always') {
      void this.flush();
      return;
    }
    if (this.asked || this.askTimer) return;
    // Wait a moment: one problem often brings a few errors with it, and one question covers them.
    this.askTimer = setTimeout(() => {
      this.askTimer = null;
      if (!this.asked && this.unsent.size) this.d.onAsk();
    }, ASK_DELAY);
  }

  /** The window's answer to "Send an error report?". */
  async respond(answer: Answer): Promise<void> {
    this.asked = true;
    if (answer === 'always' || answer === 'never') await this.d.settings.update({ errorReports: answer });
    if (answer === 'once' || answer === 'always') await this.flush();
    this.d.onChange();
  }

  private events(fingerprints: Iterable<string>) {
    return [...fingerprints].flatMap((fp) => {
      const r = this.records.get(fp);
      if (!r) return [];
      return [
        {
          fp,
          event: toEvent(
            { level: r.kind === 'crash' ? 'fatal' : 'error', source: r.source, kind: r.kind, name: r.name, message: r.message, ...(r.stack ? { stack: r.stack } : {}), fingerprint: r.fingerprint, count: r.count, ...(r.context ? { context: r.context } : {}) },
            this.d.env,
          ),
        },
      ];
    });
  }

  /** Exactly what would be sent for the errors not sent yet, as the service would receive it. */
  preview(): string {
    const events = this.events(this.unsent).map((e) => e.event);
    return events.length ? JSON.stringify(events.length === 1 ? events[0] : events, null, 2) : 'Nothing is waiting to be sent.';
  }

  private flush(): Promise<void> {
    this.sending = this.sending.then(async () => {
      const dsn = this.d.dsn;
      if (!dsn) return;
      for (const { fp, event } of this.events(this.unsent)) {
        if (this.sent >= MAX_SENT_PER_SESSION) break;
        try {
          await sendEnvelope(dsn, envelope(event, dsn), this.d.fetch);
          this.sent++;
          this.unsent.delete(fp);
          const r = this.records.get(fp);
          if (r) this.records.set(fp, { ...r, sent: true });
        } catch (e) {
          // Offline, or the service is down: keep it for later in the session.
          log.warn('reports', 'could not send an error report', e);
          break;
        }
      }
      this.d.onChange();
    });
    return this.sending;
  }

  /** Called when the app window's process stopped and the window was loaded again. */
  windowRecovered(): void {
    this.recovered = true;
  }

  /** What the window should bring up when it loads: a recovery notice, a question. Read once. */
  pending(): { recovered: boolean; ask: boolean } {
    const out = { recovered: this.recovered, ask: this.available && this.consent === 'ask' && !this.asked && this.unsent.size > 0 };
    this.recovered = false;
    return out;
  }

  status(): ReportsStatus {
    return { available: this.available, consent: this.consent, unsent: this.unsent.size, crashes: this.available && this.consent !== 'never' ? this.crashDumps.length : 0 };
  }

  /** Look for crash dumps from earlier sessions; old ones are cleared away. */
  async scanCrashes(): Promise<void> {
    if (!this.d.crashDir) return;
    const found: string[] = [];
    const walk = async (dir: string, depth: number) => {
      for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const path = join(dir, entry.name);
        if (entry.isDirectory() && depth < 3) await walk(path, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.dmp')) found.push(path);
      }
    };
    await walk(this.d.crashDir, 0);
    const cutoff = Date.now() - CRASH_KEEP_DAYS * 86_400_000;
    this.crashDumps = [];
    for (const path of found) {
      const s = await stat(path).catch(() => null);
      if (!s) continue;
      if (s.mtimeMs < cutoff) await rm(path, { force: true });
      else this.crashDumps.push(path);
    }
    if (this.crashDumps.length) log.warn('reports', `${this.crashDumps.length} crash report(s) from earlier sessions`);
  }

  /** Send the crash dumps from earlier sessions, or not; either way they're cleared afterwards. */
  async answerCrashes(send: boolean): Promise<void> {
    const dsn = this.d.dsn;
    for (const path of this.crashDumps) {
      if (send && dsn) {
        try {
          await sendMinidump(dsn, await readFile(path), this.d.env, this.d.fetch);
        } catch (e) {
          log.warn('reports', 'could not send a crash report', e);
          continue;
        }
      }
      await rm(path, { force: true });
    }
    this.crashDumps = [];
    this.d.onChange();
  }

  /** The last lines of the app's log, cleaned. */
  private async recentLog(lines = 200): Promise<string> {
    const file = join(this.d.logsDir, 'main.log');
    try {
      const handle = await open(file, 'r');
      try {
        const { size } = await handle.stat();
        const length = Math.min(size, 128 * 1024);
        const buf = Buffer.alloc(length);
        await handle.read(buf, 0, length, size - length);
        return this.d
          .scrub()(buf.toString('utf8'))
          .split('\n')
          .slice(-lines)
          .join('\n')
          .trim();
      } finally {
        await handle.close();
      }
    } catch {
      return '(no log yet)';
    }
  }

  /** A report the user asked for: their words, what was caught this session, and the recent log. */
  async problemReport(note: string): Promise<string> {
    const env = this.d.env;
    const errors = [...this.records.values()];
    const parts = [
      `Tessera problem report`,
      `${env.release} · ${env.environment} · ${env.os.name} ${env.os.version} (${env.os.arch}) · Electron ${env.runtime.electron}`,
      '',
      '## What happened',
      note.trim() || '(not described)',
      '',
      `## Errors this session (${errors.length})`,
      ...(errors.length ? errors.map((r) => `- ${r.at} [${r.source}/${r.kind}] ${r.name}: ${r.message}${r.count > 1 ? ` (×${r.count})` : ''}${r.stack ? `\n  ${r.stack.split('\n').slice(1, 6).join('\n  ')}` : ''}`) : ['(none)']),
      '',
      '## Recent log',
      await this.recentLog(),
    ];
    return parts.join('\n');
  }

  async sendProblem(note: string): Promise<void> {
    const dsn = this.d.dsn;
    if (!dsn) throw new Error('This build has nowhere to send reports.');
    const text = await this.problemReport(note);
    const event = toEvent({ level: 'info', source: 'user', kind: 'report', name: 'Problem report', message: note.trim().slice(0, 2000) || 'Problem report' }, this.d.env);
    await sendEnvelope(dsn, envelope(event, dsn, [{ filename: 'report.txt', text }]), this.d.fetch);
  }

  dispose(): void {
    if (this.askTimer) clearTimeout(this.askTimer);
  }
}
