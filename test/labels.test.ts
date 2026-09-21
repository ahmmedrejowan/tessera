import { describe, expect, it } from 'vitest';
import { displayName, formatsLabel, typeSummary } from '../src/renderer/src/components/labels';

describe('labels', () => {
  it('shows names without extensions or random ids', () => {
    expect(displayName('dead-tree-16MPvqwl.glb')).toBe('dead-tree');
    expect(displayName('tree-branches.fbx')).toBe('tree-branches');
    expect(displayName('tile_0001.png')).toBe('tile_0001');
    expect(displayName('README')).toBe('README');
  });
  it('summarises formats and pack contents', () => {
    expect(formatsLabel('glb', ['fbx', 'glb', 'obj'])).toBe('GLB +2');
    expect(formatsLabel('png', ['png'])).toBe('PNG');
    expect(typeSummary({ model: 140, texture: 3, sfx: 1 })).toBe('140 models · 3 textures · more');
    expect(typeSummary({})).toBe('Empty');
  });
});
