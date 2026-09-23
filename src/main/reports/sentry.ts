/**
 * Sending reports to a Sentry-compatible service (Sentry itself, or a self-hosted GlitchTip),
 * without its SDK: an event is a small JSON document posted as an "envelope". Doing it by hand
 * keeps the app small and makes it plain what is sent: only what `toEvent` builds, from text
 * that has already been cleaned.
 */
import { randomBytes } from 'node:crypto';

export interface Dsn {
  /** e.g. https://o123.ingest.sentry.io */
  origin: string;
  projectId: string;
  publicKey: string;
  raw: string;
}

/** `https://<key>@<host>/<project>`; null when it isn't one. */
export function parseDsn(dsn: string | undefined | null): Dsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn.trim());
    const projectId = url.pathname.split('/').filter(Boolean).at(-1);
    if (!/^https?:$/.test(url.protocol) || !url.username || !projectId) return null;
    const prefix = url.pathname.split('/').filter(Boolean).slice(0, -1).join('/');
    return { origin: `${url.protocol}//${url.host}${prefix ? `/${prefix}` : ''}`, projectId, publicKey: url.username, raw: dsn.trim() };
  } catch {
    return null;
  }
}

export interface Frame {
  function?: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/** Frames from a V8 stack trace, outermost call first as Sentry expects. */
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split('\n')) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const [, fn, filename, lineno, colno] = m;
    frames.push({
      ...(fn ? { function: fn } : {}),
      filename: filename!,
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: filename!.startsWith('app://') && !filename!.includes('node_modules'),
    });
  }
  return frames.reverse();
}

export interface EventInput {
  level: 'fatal' | 'error' | 'info';
  source: string;
  kind: string;
  name: string;
  message: string;
  stack?: string;
  fingerprint?: string;
  count?: number;
  context?: Record<string, string>;
}

export interface Environment {
  release: string;
  environment: 'production' | 'development';
  os: { name: string; version: string; arch: string };
  runtime: { electron: string; chrome: string; node: string };
}

export const eventId = () => randomBytes(16).toString('hex');

/** The event as Sentry stores it. No user, no host name, no IP: nothing that says who sent it. */
export function toEvent(input: EventInput, env: Environment, id = eventId(), now = Date.now()): Record<string, unknown> {
  const frames = parseStack(input.stack);
  return {
    event_id: id,
    timestamp: now / 1000,
    platform: 'node',
    level: input.level,
    logger: input.source,
    release: env.release,
    environment: env.environment,
    tags: { source: input.source, kind: input.kind, os: env.os.name, arch: env.os.arch },
    contexts: {
      os: { name: env.os.name, version: env.os.version },
      runtime: { name: 'Electron', version: env.runtime.electron },
      browser: { name: 'Chrome', version: env.runtime.chrome },
      app: { app_version: env.release.split('@')[1] ?? env.release },
    },
    ...(input.kind === 'report'
      ? { message: { formatted: input.message } }
      : { exception: { values: [{ type: input.name, value: input.message, ...(frames.length ? { stacktrace: { frames } } : {}), mechanism: { type: input.kind, handled: input.kind !== 'crash' } }] } }),
    ...(input.fingerprint ? { fingerprint: [input.fingerprint] } : {}),
    extra: { ...(input.context ?? {}), ...(input.count && input.count > 1 ? { timesThisSession: input.count } : {}) },
  };
}

export interface Attachment {
  filename: string;
  text: string;
}

/** An envelope: a header line, then one header line and one payload line per item. */
export function envelope(event: Record<string, unknown>, dsn: Dsn, attachments: Attachment[] = []): string {
  const lines = [JSON.stringify({ event_id: event.event_id, dsn: dsn.raw, sent_at: new Date().toISOString() })];
  const payload = JSON.stringify(event);
  lines.push(JSON.stringify({ type: 'event', length: Buffer.byteLength(payload) }), payload);
  for (const a of attachments) {
    lines.push(JSON.stringify({ type: 'attachment', length: Buffer.byteLength(a.text), filename: a.filename, content_type: 'text/plain' }), a.text);
  }
  return `${lines.join('\n')}\n`;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string | FormData }) => Promise<{ ok: boolean; status: number }>;

const auth = (dsn: Dsn) => `Sentry sentry_version=7, sentry_client=tessera/1, sentry_key=${dsn.publicKey}`;

export async function sendEnvelope(dsn: Dsn, body: string, fetcher: Fetch): Promise<void> {
  const res = await fetcher(`${dsn.origin}/api/${dsn.projectId}/envelope/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': auth(dsn) },
    body,
  });
  if (!res.ok) throw new Error(`The report service answered ${res.status}`);
}

/** A native crash dump, uploaded to the minidump endpoint. */
export async function sendMinidump(dsn: Dsn, dump: Uint8Array, env: Environment, fetcher: Fetch): Promise<void> {
  const form = new FormData();
  form.append('upload_file_minidump', new Blob([dump as Uint8Array<ArrayBuffer>]), 'crash.dmp');
  form.append('sentry', JSON.stringify({ release: env.release, environment: env.environment, tags: { source: 'crash', os: env.os.name } }));
  const res = await fetcher(`${dsn.origin}/api/${dsn.projectId}/minidump/?sentry_key=${dsn.publicKey}`, { method: 'POST', headers: {}, body: form });
  if (!res.ok) throw new Error(`The report service answered ${res.status}`);
}
