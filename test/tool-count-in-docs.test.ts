import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/main/mcp/tools';

/**
 * The number of tools is written out in prose in a few places, and prose does not recompile.
 * Every one of these was wrong by the time anybody noticed, so it is checked here instead.
 */
const SAYS_A_NUMBER = ['README.md', 'CHANGELOG.md', 'docs/guide/15-agents.md'];

describe('what the writing says about the tools', () => {
  it.each(SAYS_A_NUMBER)('%s counts them the way the code does', (file) => {
    const text = readFileSync(join(__dirname, '..', file), 'utf8');
    const said = [...text.matchAll(/(\d+) tools/g)].map((m) => Number(m[1]));
    expect(said.length, `${file} no longer says how many tools there are`).toBeGreaterThan(0);
    for (const n of said) expect(n, `${file} says ${n} tools, there are ${TOOLS.length}`).toBe(TOOLS.length);
  });
});
