import { describe, expect, it } from 'vitest';
import { combo, comboText, shortcutGroups } from '../src/renderer/src/shell/keys';

const find = (platform: 'darwin' | 'win32' | 'linux', label: string) =>
  shortcutGroups(platform)
    .flatMap((g) => g.items)
    .find((s) => s.label === label)!.keys;

describe('keyboard shortcuts per system', () => {
  it('writes macOS keys the Apple way: symbols, ⌃⌥⇧⌘ order, side by side', () => {
    expect(combo('darwin', 'O', 'mod', 'shift')).toEqual(['⇧', '⌘', 'O']);
    expect(comboText('darwin', 'F', 'mod')).toBe('⌘F');
    expect(find('darwin', 'Back · forward')).toEqual([['⌘', '['], ['⌘', ']']]);
    expect(find('darwin', 'Full screen')).toEqual([['⌃', '⌘', 'F']]);
  });

  it('writes Windows and Linux keys by name, Ctrl first, joined with +', () => {
    for (const p of ['win32', 'linux'] as const) {
      expect(combo(p, 'O', 'mod', 'shift')).toEqual(['Ctrl', 'Shift', 'O']);
      expect(comboText(p, 'F', 'mod')).toBe('Ctrl+F');
      expect(find(p, 'Back · forward')).toEqual([['Alt', '←'], ['Alt', '→']]);
      expect(find(p, 'Full screen')).toEqual([['F11']]);
      expect(find(p, 'Select more · a range')).toEqual([['Ctrl', 'click'], ['Shift', 'click']]);
      // No Apple symbols anywhere.
      const all = shortcutGroups(p).flatMap((g) => g.items.flatMap((s) => s.keys.flat()));
      expect(all.some((k) => /[⌘⇧⌥⌃]/.test(k))).toBe(false);
    }
  });
});
