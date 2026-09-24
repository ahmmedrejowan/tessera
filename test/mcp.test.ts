import { describe, expect, it } from 'vitest';
import { TOOL_GROUPS } from '../src/shared/mcp';
import { catalogue, said, toolsOn } from '../src/main/mcp/server';
import { TOOLS, TOOL_BY_NAME } from '../src/main/mcp/tools';
import { skillMarkdown } from '../src/main/mcp/skill';

const OPT_IN = TOOL_GROUPS.filter((g) => !g.defaultOn).map((g) => g.id);
const ALL_ON = { off: [], groupsOff: [], groupsOn: OPT_IN };
const DEFAULTS = { off: [], groupsOff: [], groupsOn: [] };

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
    // Deleting means the bin unless the owner has allowed more: the group that cannot be undone
    // is its own, and off until asked for.
    expect(TOOLS.filter((t) => t.group === 'remove').map((t) => t.name).sort()).toEqual(['delete_to_bin', 'restore_from_bin']);
    expect(TOOLS.filter((t) => /^empty|discard/.test(t.name)).every((t) => t.group === 'danger')).toBe(true);
  });

  it('switches off a whole group, or one tool inside a group that is on', () => {
    expect(toolsOn(ALL_ON)).toHaveLength(TOOLS.length);
    const withoutRemove = toolsOn({ ...ALL_ON, groupsOff: ['remove'] });
    expect(withoutRemove.some((t) => t.group === 'remove')).toBe(false);
    expect(withoutRemove.some((t) => t.name === 'search')).toBe(true);
    expect(toolsOn({ ...ALL_ON, off: ['search'] }).some((t) => t.name === 'search')).toBe(false);
    expect(catalogue({ ...ALL_ON, off: ['search'] }).find((t) => t.name === 'search')?.on).toBe(false);
  });

  it('keeps the dangerous groups off until they are asked for', () => {
    expect(OPT_IN).toEqual(['system', 'danger']);
    const asShipped = toolsOn(DEFAULTS);
    expect(asShipped.some((t) => t.group === 'danger')).toBe(false);
    expect(asShipped.some((t) => t.group === 'system')).toBe(false);
    expect(asShipped.some((t) => t.name === 'search')).toBe(true);
    // Nothing that cannot be undone is on by default.
    expect(asShipped.some((t) => t.name === 'empty_bin' || t.name === 'discard_review_pack')).toBe(false);
    expect(toolsOn({ ...DEFAULTS, groupsOn: ['danger'] }).some((t) => t.name === 'empty_bin')).toBe(true);
  });

  it('gives an agent every part of the window: packs, files, collections, games, downloads, the app', () => {
    const names = new Set(TOOLS.map((t) => t.name));
    for (const needed of ['list_packs', 'list_assets', 'add_files_to_pack', 'set_pack_details', 'set_pack_cover', 'edit_collection', 'delete_collection', 'add_game', 'edit_game', 'unlink_from_game', 'list_libraries', 'open_library', 'create_library', 'get_settings', 'set_settings', 'empty_bin']) {
      expect(names.has(needed), needed).toBe(true);
    }
  });
});

describe('what a call is shown as', () => {
  it('says what was asked for, in the words the agent used', () => {
    expect(said({ text: 'arcade', of: 'packs' })).toBe('text: arcade · of: packs');
    expect(said({})).toBe('');
    expect(said({ text: '', filters: {} })).toBe('filters: {}');
  });

  it('counts ids rather than showing them, since they mean nothing to a person', () => {
    expect(said({ packId: '99e983f3-605b-4d42-b89f-d698796ca32f' })).toBe('');
    expect(said({ packIds: ['99e983f3-605b-4d42-b89f-d698796ca32f'] })).toBe('1 pack');
    expect(said({ packIds: ['99e983f3-605b-4d42-b89f-d698796ca32f', '99e983f3-605b-4d42-b89f-d698796ca33f'] })).toBe('2 packs');
  });

  it('keeps a long value short enough to read', () => {
    expect(said({ text: 'x'.repeat(80) }).length).toBeLessThan(50);
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
