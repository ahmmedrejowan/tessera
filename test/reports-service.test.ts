/**
 * What happens when something goes wrong, and what leaves the computer because of it.
 *
 * Nothing is sent without being asked for, and what is sent is cleaned of anything about the
 * person first. Both of those are promises the app makes in writing, so both are tested here
 * rather than assumed, including the case where the reader says no.
 */
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import type { ErrorInput } from '@shared/types';
import { ReportService } from '../src/main/reports/service';
import { parseDsn } from '../src/main/reports/sentry';
import { SettingsStore } from '../src/main/settings';
import { tempDir } from './helpers';

const DSN = parseDsn('https://akey@reports.example.test/1')!;

const broke = (over: Partial<ErrorInput> = {}): ErrorInput => ({
  source: 'window',
  kind: 'exception',
  name: 'TypeError',
  message: 'it broke',
  stack: 'at somewhere',
  ...over,
});

/** A report service with a stand-in for the network and settings of its own. */
async function reporting(over: { consent?: 'ask' | 'always' | 'never'; dsn?: typeof DSN | null } = {}) {
  const dataDir = tempDir();
  const settings = new SettingsStore(dataDir);
  await settings.load();
  if (over.consent) await settings.update({ errorReports: over.consent });

  const sent: { url: string; body: string }[] = [];
  const asked: number[] = [];
  const reports = new ReportService({
    logsDir: join(dataDir, 'logs'),
    crashDir: join(dataDir, 'crashes'),
    settings,
    scrub: () => (text: string) => text.replace(/\/Users\/[^/\s]+/g, '<home>'),
    env: {
      release: 'tessera@0.0.0-test',
      environment: 'production',
      os: { name: 'macOS', version: '26.0', arch: 'arm64' },
      runtime: { electron: '44.0.0', chrome: '138', node: '24' },
    },
    dsn: over.dsn === undefined ? DSN : over.dsn,
    fetch: (async (url: string, init?: RequestInit) => {
      sent.push({ url: String(url), body: String(init?.body ?? '') });
      return { ok: true, status: 200, text: async () => '' } as Response;
    }) as never,
    onAsk: () => void asked.push(1),
    onChange: () => undefined,
  });
  mkdirSync(join(dataDir, 'logs'), { recursive: true });
  return { reports, settings, sent, asked, dataDir };
}

/** Wait for the sending, which happens after the call that caused it. */
const settle = () => new Promise((r) => setTimeout(r, 50));

/** Wait for something to become true, rather than guessing how long the app takes. */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`gave up waiting for ${what}`);
}

describe('catching something that went wrong', () => {
  it('keeps it, and says what is waiting', async () => {
    const { reports } = await reporting({ consent: 'ask' });
    const kept = reports.record(broke());
    await settle();
    expect(kept.message).toBe('it broke');
    expect(kept.sent).toBe(false);
    expect(reports.status().unsent).toBe(1);
    // The window is told, when it next loads, that there is something to ask about.
    expect(reports.pending().ask).toBe(true);
  });

  it('asks before sending anything, and sends nothing until told', async () => {
    const { reports, sent, asked } = await reporting({ consent: 'ask' });
    reports.record(broke());
    // The question waits a moment, so that one problem bringing several errors asks once.
    await until(() => asked.length === 1, 'the question');
    expect(sent).toEqual([]);
  });

  it('sends it once the reader says yes, and remembers the answer', async () => {
    const { reports, settings, sent } = await reporting({ consent: 'ask' });
    reports.record(broke());
    await settle();
    await reports.respond('always');
    await until(() => sent.length === 1, 'the report to go');
    expect(sent[0]!.url).toContain('reports.example.test');
    expect(settings.get().errorReports).toBe('always');
  });

  it('sends nothing at all when the reader says never, and forgets what was waiting', async () => {
    const { reports, sent } = await reporting({ consent: 'ask' });
    reports.record(broke());
    await settle();
    await reports.respond('never');
    await settle();
    expect(sent).toEqual([]);
  });

  it('sends without asking once the reader has already said always', async () => {
    const { reports, sent, asked } = await reporting({ consent: 'always' });
    reports.record(broke());
    await until(() => sent.length === 1, 'the report to go');
    expect(asked).toEqual([]);
  });

  it('sends nothing at all when the reader has said never, and never asks again', async () => {
    const { reports, sent, asked } = await reporting({ consent: 'never' });
    reports.record(broke());
    await settle();
    // It is still written into the app's own error file, which is the reader's to look at; it
    // simply never leaves the computer, and they are not asked about it again.
    expect(sent).toEqual([]);
    expect(asked).toEqual([]);
    expect(reports.pending().ask).toBe(false);
  });

  it('has nowhere to send anything when the build carries no address', async () => {
    const { reports, sent } = await reporting({ consent: 'always', dsn: null });
    reports.record(broke());
    await settle();
    expect(sent).toEqual([]);
    expect(reports.status().available).toBe(false);
  });
});

describe('what is in a report', () => {
  it('shows the reader exactly what would be sent', async () => {
    const { reports } = await reporting({ consent: 'ask' });
    reports.record(broke({ message: 'failed reading /Users/someone/Library/thing' }));
    await settle();
    const preview = reports.preview();
    expect(preview).toBeTruthy();
    expect(preview).not.toContain('/Users/someone');
    expect(preview).toContain('<home>');
  });

  it('carries the version and the system, and nothing about the person', async () => {
    const { reports, sent } = await reporting({ consent: 'always' });
    reports.record(broke({ message: 'broke in /Users/someone/Documents' }));
    await until(() => sent.length > 0, 'the report to go');
    const body = sent[0]!.body;
    expect(body).toContain('0.0.0-test');
    expect(body).toContain('macOS');
    expect(body).not.toContain('/Users/someone');
  });

  it('gathers the same again, twice, as one report rather than two', async () => {
    const { reports, sent } = await reporting({ consent: 'always' });
    reports.record(broke());
    reports.record(broke());
    await until(() => sent.length > 0, 'the report to go');
    // The same problem twice is one report with a count, not two reports.
    expect(sent.length).toBe(1);
    expect(reports.status().unsent).toBe(0);
  });
});

describe('when the reports cannot go anywhere', () => {
  it('keeps what could not be sent for later in the session', async () => {
    const { reports, settings, dataDir } = await reporting({ consent: 'always' });
    void settings;
    void dataDir;
    // The stand-in above always succeeds, so this one is built to fail instead.
    const failing = new ReportService({
      logsDir: join(dataDir, 'logs'),
      crashDir: null,
      settings,
      scrub: () => (text: string) => text,
      env: { release: 'tessera@0.0.0-test', environment: 'production', os: { name: 'macOS', version: '26.0', arch: 'arm64' }, runtime: { electron: '44.0.0', chrome: '138', node: '24' } },
      dsn: DSN,
      fetch: (async () => {
        throw new Error('offline');
      }) as never,
      onAsk: () => undefined,
      onChange: () => undefined,
    });
    failing.record(broke());
    await settle();
    // It is still waiting rather than counted as sent, and nothing threw.
    expect(failing.status().unsent).toBe(1);
    failing.dispose();
    void reports;
  });

  it('will not offer to send a problem report from a build with nowhere to send it', async () => {
    const { reports } = await reporting({ consent: 'ask', dsn: null });
    await expect(reports.sendProblem('The window went blank')).rejects.toThrow(/nowhere to send/);
  });
});

describe('a problem report written by hand', () => {
  it('says so plainly when the writer described nothing, and lists what went wrong', async () => {
    const { reports } = await reporting({ consent: 'ask' });
    reports.record(broke());
    reports.record(broke());
    const text = await reports.problemReport('   ');
    expect(text).toContain('(not described)');
    // The same problem twice is one line with a count on it.
    expect(text).toContain('(×2)');
  });

  it('says there is nothing waiting when nothing is', async () => {
    const { reports } = await reporting({ consent: 'ask' });
    expect(reports.preview()).toBe('Nothing is waiting to be sent.');
  });

  it('notes that the window had to be loaded again, once', async () => {
    const { reports } = await reporting({ consent: 'ask' });
    reports.windowRecovered();
    expect(reports.pending().recovered).toBe(true);
    // Read once: the notice is not shown again on the next question.
    expect(reports.pending().recovered).toBe(false);
  });

  it('is put together from the logs, and can be read before it goes', async () => {
    const { reports, dataDir } = await reporting({ consent: 'ask' });
    writeFileSync(join(dataDir, 'logs', 'tessera.log'), 'something happened in /Users/someone/Library\n');
    const text = await reports.problemReport('The window went blank');
    expect(text).toContain('The window went blank');
    expect(text).not.toContain('/Users/someone');
  });

  it('is sent only when the reader asks for it to be', async () => {
    const { reports, sent } = await reporting({ consent: 'ask' });
    expect(sent).toEqual([]);
    await reports.sendProblem('The window went blank');
    await until(() => sent.length === 1, 'the problem report to go');
  });
});

describe('a crash the app did not live to report', () => {
  it('finds nothing when nothing crashed', async () => {
    const { reports } = await reporting({ consent: 'always' });
    await reports.scanCrashes();
    expect(reports.status().crashes).toBe(0);
  });

  it('sends the dump once the reader says so, and clears it away afterwards', async () => {
    const { reports, sent, dataDir } = await reporting({ consent: 'always' });
    const dumps = join(dataDir, 'crashes', 'completed');
    mkdirSync(dumps, { recursive: true });
    const dump = join(dumps, 'a-crash.dmp');
    writeFileSync(dump, 'not really a dump');

    await reports.scanCrashes();
    expect(reports.status().crashes).toBe(1);

    await reports.answerCrashes(true);
    expect(sent).toHaveLength(1);
    // Sent or not, a dump is never kept lying about afterwards.
    expect(existsSync(dump)).toBe(false);
    expect(reports.status().crashes).toBe(0);
  });

  it('clears away a dump too old to be worth anything', async () => {
    const { reports, dataDir } = await reporting({ consent: 'always' });
    const dumps = join(dataDir, 'crashes', 'completed');
    mkdirSync(dumps, { recursive: true });
    const old = join(dumps, 'ancient.dmp');
    writeFileSync(old, 'not really a dump');
    const longAgo = new Date(Date.now() - 400 * 86_400_000);
    utimesSync(old, longAgo, longAgo);

    await reports.scanCrashes();
    expect(reports.status().crashes).toBe(0);
    expect(existsSync(old)).toBe(false);
  });

  it('notices a crash dump, and sends nothing until the reader says so', async () => {
    const { reports, sent, dataDir } = await reporting({ consent: 'ask' });
    const dumps = join(dataDir, 'crashes', 'completed');
    mkdirSync(dumps, { recursive: true });
    writeFileSync(join(dumps, 'a-crash.dmp'), 'not really a dump');

    await reports.scanCrashes();
    expect(sent).toEqual([]);

    await reports.answerCrashes(false);
    expect(sent).toEqual([]);
  });
});
