import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The window can only ask for what the main process answers. Nothing checks that at runtime until
 * someone presses the button, so it is checked here: every channel in the contract has exactly one
 * handler, and no handler answers a channel that is not in the contract.
 */
const read = (path: string) => readFileSync(join(import.meta.dirname, '..', path), 'utf8');

/** The channels the contract declares, from the two blocks in shared/ipc.ts. */
function declared(): { invokes: string[]; events: string[] } {
  const src = read('src/shared/ipc.ts');
  const block = (name: string) => src.slice(src.indexOf(`export interface ${name}`)).split('\n}')[0]!;
  const names = (text: string) => [...text.matchAll(/^\s*'([a-zA-Z]+:[a-zA-Z]+)':/gm)].map((m) => m[1]!);
  return { invokes: names(block('Invokes')), events: names(block('Events')) };
}

/** The channels the main process answers, across every file that registers handlers. */
function handled(): string[] {
  const dir = join(import.meta.dirname, '..', 'src/main/ipc');
  const out: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(dir, file), 'utf8');
    out.push(...[...src.matchAll(/\bhandle\('([a-zA-Z]+:[a-zA-Z]+)'/g)].map((m) => m[1]!));
  }
  return out;
}

describe('the contract between the window and the app', () => {
  const { invokes, events } = declared();
  const answered = handled();

  it('declares a good few channels, so this test is testing something', () => {
    expect(invokes.length).toBeGreaterThan(100);
    expect(events.length).toBeGreaterThan(10);
  });

  it('answers every channel it declares', () => {
    const missing = invokes.filter((c) => !answered.includes(c));
    expect(missing, `no handler for: ${missing.join(', ')}`).toEqual([]);
  });

  it('answers each of them once', () => {
    const twice = answered.filter((c, i) => answered.indexOf(c) !== i);
    expect(twice, `handled more than once: ${twice.join(', ')}`).toEqual([]);
  });

  it('answers nothing that was never declared', () => {
    const extra = answered.filter((c) => !invokes.includes(c));
    expect(extra, `handled but not in the contract: ${extra.join(', ')}`).toEqual([]);
  });
});
