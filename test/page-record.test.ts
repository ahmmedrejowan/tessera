/**
 * Keeping the page a pack came from.
 *
 * Two things are kept alongside a licence: a PDF of the page as it was, and a public copy at the
 * Internet Archive. The archive is often busy, so most of what matters here is what happens when
 * it says no: one more try, then the copy it already has, and a plain refusal if there is none.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { asked, forget } from './fake-electron';
import { archivePage, snapshotPage } from '../src/main/import/pageRecord';
import { UserError } from '../src/main/errors';

afterEach(() => {
  forget();
  vi.useRealTimers();
});

/** An answer from archive.org, as `net.fetch` would hand it over. */
function answer(init: { url?: string; status?: number; headers?: Record<string, string>; body?: unknown }): Response {
  const res = new Response(init.body === undefined ? null : JSON.stringify(init.body), {
    status: init.status ?? 200,
    headers: init.headers,
  });
  if (init.url) Object.defineProperty(res, 'url', { value: init.url });
  return res;
}

/** Answer each request in turn, and remember what was asked for. */
function answering(...replies: (Response | Error)[]): string[] {
  const seen: string[] = [];
  let i = 0;
  asked.fetch = async (url) => {
    seen.push(url);
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    if (reply instanceof Error) throw reply;
    return reply!;
  };
  return seen;
}

const SAVED = 'https://web.archive.org/web/20260101000000/https://example.test/pack';

describe('saving the page as a PDF', () => {
  it('will only save a web page', async () => {
    await expect(snapshotPage('file:///etc/passwd')).rejects.toBeInstanceOf(UserError);
    await expect(snapshotPage('data:text/html,hello')).rejects.toThrow(/web pages/);
  });

  it('gives back a PDF of the page', async () => {
    const pdf = await snapshotPage('https://example.test/pack');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('says plainly when the page would not open', async () => {
    asked.pageLoad = new Error('ERR_NAME_NOT_RESOLVED');
    await expect(snapshotPage('https://nowhere.test/pack')).rejects.toThrow(/couldn’t be opened/);
  });
});

describe('asking the archive to keep a copy', () => {
  it('will only archive a web page', async () => {
    await expect(archivePage('/Users/someone/pack.zip')).rejects.toThrow(/web pages/);
  });

  it('gives back the new copy when the save works', async () => {
    const seen = answering(answer({ url: SAVED }));
    await expect(archivePage('https://example.test/pack')).resolves.toEqual({ url: SAVED, fresh: true });
    expect(seen[0]).toContain('web.archive.org/save/');
  });

  it('takes the address from the header when the answer does not carry one', async () => {
    answering(answer({ url: 'https://web.archive.org/save/https://example.test/pack', headers: { 'content-location': '/web/20260101000000/https://example.test/pack' } }));
    await expect(archivePage('https://example.test/pack')).resolves.toEqual({ url: SAVED, fresh: true });
  });

  it('stops asking when told there have been too many requests, and offers the copy already there', async () => {
    const seen = answering(
      answer({ status: 429 }),
      answer({ body: { archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/20250101000000/https://example.test/pack' } } } }),
    );
    // The copy it already has, and over https even though the archive answered with http.
    await expect(archivePage('https://example.test/pack')).resolves.toEqual({
      url: 'https://web.archive.org/web/20250101000000/https://example.test/pack',
      fresh: false,
    });
    // Two requests, not three: a refusal for being too busy is not worth waiting out.
    expect(seen).toHaveLength(2);
    expect(seen[1]).toContain('wayback/available');
  });

  it('tries once more after a pause when the save fails outright', async () => {
    vi.useFakeTimers();
    const seen = answering(
      new Error('socket hang up'),
      answer({ url: SAVED }),
    );
    const done = archivePage('https://example.test/pack');
    await vi.advanceTimersByTimeAsync(21_000);
    await expect(done).resolves.toEqual({ url: SAVED, fresh: true });
    expect(seen).toHaveLength(2);
  });

  it('says so plainly when there is no copy to fall back on', async () => {
    answering(answer({ status: 429 }), answer({ body: { archived_snapshots: {} } }));
    await expect(archivePage('https://example.test/pack')).rejects.toThrow(/couldn’t save the page/);
  });

  it('copes with an answer that is not the JSON it expected', async () => {
    answering(answer({ status: 429 }), new Response('<html>busy</html>', { status: 200 }));
    await expect(archivePage('https://example.test/pack')).rejects.toBeInstanceOf(UserError);
  });

  it('does not take a copy the archive says is not available', async () => {
    answering(answer({ status: 429 }), answer({ body: { archived_snapshots: { closest: { available: false, url: SAVED } } } }));
    await expect(archivePage('https://example.test/pack')).rejects.toThrow(/busy/);
  });
});
