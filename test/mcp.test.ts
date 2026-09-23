import { describe, expect, it } from 'vitest';
import { TOOL_GROUPS } from '../src/shared/mcp';
import { catalogue, toolsOn } from '../src/main/mcp/server';
import { TOOLS, TOOL_BY_NAME } from '../src/main/mcp/tools';
import { skillMarkdown } from '../src/main/mcp/skill';

const ALL_ON = { off: [], groupsOff: [] };

describe('the tools an agent is offered', () => {
  it('has a unique name and a known group for every tool', () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    expect(TOOL_BY_NAME.size).toBe(TOOLS.length);
    const groups = new Set(TOOL_GROUPS.map((g) => g.id));
    for (const t of TOOLS) expect(groups.has(t.group)).toBe(true);
  });

  it('says what it does and what it takes, so an agent can choose without guessing', () => {
    for (const t of catalogue(ALL_ON)) {
      expect(t.summary.length).toBeGreaterThan(20);
      expect(t.schema).toMatchObject({ type: 'object' });
    }
  });

  it('covers every group, and reading is separate from changing', () => {
    for (const g of TOOL_GROUPS) expect(TOOLS.some((t) => t.group === g.id)).toBe(true);
    // Deleting only ever means the bin: the only tools that remove anything are the two bin ones.
    expect(TOOLS.filter((t) => t.group === 'remove').map((t) => t.name).sort()).toEqual(['delete_to_bin', 'restore_from_bin']);
    expect(TOOLS.some((t) => /^empty/.test(t.name))).toBe(false);
  });

  it('switches off a whole group, or one tool inside a group that is on', () => {
    expect(toolsOn(ALL_ON)).toHaveLength(TOOLS.length);
    const withoutRemove = toolsOn({ off: [], groupsOff: ['remove'] });
    expect(withoutRemove.some((t) => t.group === 'remove')).toBe(false);
    expect(withoutRemove.some((t) => t.name === 'search')).toBe(true);
    expect(toolsOn({ off: ['search'], groupsOff: [] }).some((t) => t.name === 'search')).toBe(false);
    expect(catalogue({ off: ['search'], groupsOff: [] }).find((t) => t.name === 'search')?.on).toBe(false);
  });
});

describe('the skill file', () => {
  const text = skillMarkdown('http://127.0.0.1:7458/mcp');

  it('names itself, the address and every tool', () => {
    expect(text.startsWith('---\nname: tessera-library')).toBe(true);
    expect(text).toContain('http://127.0.0.1:7458/mcp');
    for (const t of TOOLS) expect(text).toContain(t.name);
  });

  it('teaches the rules that matter', () => {
    expect(text.toLowerCase()).toContain('never guess a licence');
    expect(text.toLowerCase()).toContain('review');
    expect(text.toLowerCase()).toContain('bin');
  });
});
