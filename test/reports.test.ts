import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeScrubber } from '../src/main/reports/scrub';
import { envelope, parseDsn, parseStack, toEvent, type Environment } from '../src/main/reports/sentry';
import { ReportService } from '../src/main/reports/service';
import { SettingsStore } from '../src/main/settings';

const env: Environment = { release: 'tessera@1.2.3', environment: 'production', os: { name: 'macOS', version: '15.0', arch: 'arm64' }, runtime: { electron: '44.0.0', chrome: '152', node: '24.21' } };
const DSN = 'https://abc123@o1.ingest.example.com/42';

describe('the report format', () => {
  it('reads a DSN', () => {
    expect(parseDsn(DSN)).toEqual({ origin: 'https://o1.ingest.example.com', projectId: '42', publicKey: 'abc123', raw: DSN });
    expect(parseDsn('https://key@glitch.example.org/sub/7')?.origin).toBe('https://glitch.example.org/sub');
    expect(parseDsn('not a dsn')).toBeNull();
    expect(parseDsn('https://glitch.example.org/7')).toBeNull();
    expect(parseDsn('')).toBeNull();
  });

  it('turns a V8 stack into frames, outermost first', () => {
    const frames = parseStack('TypeError: x\n    at copy (app://out/main/index.js:10:5)\n    at async run (app://out/main/index.js:20:3)\n    at app://node_modules/yauzl/index.js:1:1');
    expect(frames.map((f) => [f.function, f.lineno, f.in_app])).toEqual([
      [undefined, 1, false],
      ['async run', 20, true],
      ['copy', 10, true],
    ]);
  });

  it('builds an event that says nothing about who sent it', () => {
    const event = toEvent({ level: 'error', source: 'main', kind: 'exception', name: 'TypeError', message: 'boom', stack: 'TypeError: boom\n    at f (app://out/main/index.js:1:2)' }, env, 'e'.repeat(32), 1_000_000);
    expect(event).toMatchObject({ event_id: 'e'.repeat(32), timestamp: 1000, release: 'tessera@1.2.3', level: 'error', exception: { values: [{ type: 'TypeError', value: 'boom' }] } });
    expect(JSON.stringify(event)).not.toMatch(/server_name|"user"|ip_address/);
  });

  it('wraps an event and attachments in an envelope', () => {
    const dsn = parseDsn(DSN)!;
    const lines = envelope({ event_id: 'id1', a: 'é' }, dsn, [{ filename: 'report.txt', text: 'hello' }]).trimEnd().split('\n');
    expect(JSON.parse(lines[0]!)).toMatchObject({ event_id: 'id1', dsn: DSN });
    expect(JSON.parse(lines[1]!)).toEqual({ type: 'event', length: Buffer.byteLength(lines[2]!) });
    expect(JSON.parse(lines[3]!)).toMatchObject({ type: 'attachment', filename: 'report.txt', length: 5 });
    expect(lines[4]).toBe('hello');
  });
});

describe('the report service', () => {
  afterEach(() => vi.useRealTimers());

  async function setup(consent: 'ask' | 'always' | 'never', dsn: string | null = DSN) {
    const dir = await mkdtemp(join(tmpdir(), 'tessera-reports-'));
    const logs = join(dir, 'logs');
    await mkdir(logs, { recursive: true });
    const settings = new SettingsStore(dir);
    await settings.load();
    await settings.update({ errorReports: consent });
    const posts: { url: string; body: string }[] = [];
    const asks: number[] = [];
    const service = new ReportService({
      logsDir: logs,
      crashDir: join(dir, 'crashes'),
      settings,
      scrub: () => makeScrubber({ app: '/App/app.asar', home: '/Users/sam', data: dir, temp: '/tmp/x', library: '/Users/sam/Lib' }),
      env,
      dsn: parseDsn(dsn),
      fetch: async (url, init) => {
        posts.push({ url, body: String(init.body) });
        return { ok: true, status: 200 };
      },
      onAsk: () => asks.push(Date.now()),
      onChange: () => undefined,
    });
    return { dir, logs, settings, service, posts, asks };
  }

  const boom = { source: 'main' as const, kind: 'exception' as const, name: 'Error', message: "ENOENT: open '/Users/sam/Lib/packs/Secret Pack/a.zip'", stack: 'Error: x\n    at read (/App/app.asar/out/main/index.js:5:1)' };

  it('keeps every error locally, cleaned, and counts repeats', async () => {
    const { service, logs } = await setup('never');
    service.record(boom);
    const again = service.record(boom);
    expect(again.count).toBe(2);
    expect(again.message).toBe("ENOENT: open '<library>/….zip'");
    await vi.waitFor(async () => expect(await readFile(join(logs, 'errors.jsonl'), 'utf8')).toContain('<library>/….zip'));
    expect(await readFile(join(logs, 'errors.jsonl'), 'utf8')).not.toContain('Secret');
  });

  it('sends nothing without consent, or without a service', async () => {
    const never = await setup('never');
    never.service.record(boom);
    const none = await setup('always', null);
    none.service.record(boom);
    await new Promise((r) => setTimeout(r, 20));
    expect(never.posts).toHaveLength(0);
    expect(none.posts).toHaveLength(0);
    expect(none.service.status().available).toBe(false);
  });

  it('sends right away when always allowed, once per problem', async () => {
    const { service, posts } = await setup('always');
    service.record(boom);
    service.record(boom);
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.url).toBe('https://o1.ingest.example.com/api/42/envelope/');
    expect(posts[0]!.body).toContain('app://out/main/index.js');
    expect(posts[0]!.body).not.toContain('sam');
    expect(service.status().unsent).toBe(0);
  });

  it('asks once, after a moment, and does what the answer says', async () => {
    vi.useFakeTimers();
    const { service, posts, asks, settings } = await setup('ask');
    service.record(boom);
    service.record({ ...boom, name: 'TypeError', stack: 'TypeError: y\n    at other (/App/app.asar/out/main/index.js:9:1)' });
    expect(asks).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(asks).toHaveLength(1);
    expect(service.pending().ask).toBe(true);
    expect(service.preview()).toContain('TypeError');
    vi.useRealTimers();
    await service.respond('once');
    expect(posts).toHaveLength(2);
    expect(settings.get().errorReports).toBe('ask');
    service.record({ ...boom, name: 'RangeError', stack: undefined });
    await new Promise((r) => setTimeout(r, 1700));
    expect(asks).toHaveLength(1);
  });

  it('remembers "never"', async () => {
    const { service, posts, settings } = await setup('ask');
    service.record(boom);
    await service.respond('never');
    expect(settings.get().errorReports).toBe('never');
    expect(posts).toHaveLength(0);
  });

  it('writes a problem report with the recent log, cleaned', async () => {
    const { service, logs } = await setup('never');
    await writeFile(join(logs, 'main.log'), 'line one\nopened /Users/sam/Lib/packs/Forest/tree.glb\n');
    service.record(boom);
    const text = await service.problemReport('The grid went blank.');
    expect(text).toContain('The grid went blank.');
    expect(text).toContain('opened <library>/….glb');
    expect(text).toContain('Errors this session (1)');
    expect(text).not.toContain('Forest');
  });

  it('finds crash dumps and clears them once answered', async () => {
    const { service, dir, posts } = await setup('always');
    await mkdir(join(dir, 'crashes', 'completed'), { recursive: true });
    await writeFile(join(dir, 'crashes', 'completed', 'a.dmp'), 'MDMP');
    await service.scanCrashes();
    expect(service.status().crashes).toBe(1);
    await service.answerCrashes(true);
    expect(posts[0]!.url).toContain('/api/42/minidump/?sentry_key=abc123');
    expect(service.status().crashes).toBe(0);
  });
});
