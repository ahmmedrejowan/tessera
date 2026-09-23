import type { Platform } from '@shared/types';

/** Modifier keys, named as each system names them. */
type Modifier = 'mod' | 'shift' | 'alt' | 'ctrl';

const NAMES: Record<'mac' | 'pc', Record<Modifier, string>> = {
  mac: { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' },
  pc: { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', ctrl: 'Ctrl' },
};

/** The order modifiers are written in: Apple's ⌃⌥⇧⌘, and Ctrl+Alt+Shift elsewhere. */
const ORDER: Record<'mac' | 'pc', Modifier[]> = { mac: ['ctrl', 'alt', 'shift', 'mod'], pc: ['mod', 'ctrl', 'alt', 'shift'] };

const kind = (platform: Platform) => (platform === 'darwin' ? 'mac' : 'pc');

/** One key combination as keycaps for this system: modifiers named and ordered its way, then the key. */
export function combo(platform: Platform, key: string, ...mods: Modifier[]): string[] {
  const k = kind(platform);
  const caps = ORDER[k].filter((m) => mods.includes(m)).map((m) => NAMES[k][m]);
  // Ctrl stands for both mod and ctrl on Windows and Linux; say it once.
  return [...new Set(caps), key];
}

/** The same combination as text: "⌘F" on macOS, "Ctrl+F" elsewhere. */
export const comboText = (platform: Platform, key: string, ...mods: Modifier[]) => combo(platform, key, ...mods).join(platform === 'darwin' ? '' : '+');

/** Keycaps are joined by "+" on Windows and Linux, side by side on macOS. */
export const joiner = (platform: Platform) => (platform === 'darwin' ? '' : '+');

/** A shortcut: what it does, and one or more ways to do it (each a combination of keycaps). */
export interface Shortcut {
  label: string;
  keys: string[][];
  /** How the ways relate: alternatives ("/") or a range ("–"). */
  between?: '/' | '–';
}

/** Every shortcut Tessera has, grouped by where it works, as this system writes them. */
export function shortcutGroups(platform: Platform): { title: string; items: Shortcut[] }[] {
  const mac = platform === 'darwin';
  const c = (key: string, ...mods: Modifier[]) => combo(platform, key, ...mods);
  return [
    {
      title: 'Anywhere',
      items: [
        { label: 'Search, or go to a page or action', keys: [c('F', 'mod')] },
        { label: 'Go to Home … Downloads', keys: [c('1', 'mod'), c('6', 'mod')], between: '–' },
        { label: 'Back · forward', keys: mac ? [c('[', 'mod'), c(']', 'mod')] : [c('←', 'alt'), c('→', 'alt')] },
        { label: 'Add downloads', keys: [c('O', 'mod')] },
        { label: 'Add a folder of packs', keys: [c('O', 'mod', 'shift')] },
        { label: 'Settings', keys: [c(',', 'mod')] },
        { label: 'Keyboard shortcuts', keys: [c('/', 'mod')] },
      ],
    },
    {
      title: 'Search box',
      items: [
        { label: 'Move through the suggestions', keys: [['↑'], ['↓']] },
        { label: 'Run the suggestion (or stay in Browse)', keys: [['Enter']] },
        { label: 'Close the suggestions', keys: [['Esc']] },
      ],
    },
    {
      title: 'Browse',
      items: [
        { label: 'Move between assets', keys: [['←'], ['→'], ['↑'], ['↓']] },
        { label: 'Open what the cursor is on', keys: [['Space'], ['Enter']] },
        { label: 'Open a tile', keys: [['click']] },
        { label: 'Pick a tile out (or right-click)', keys: [['hold']] },
        { label: 'Pick more · a range', keys: [c('click', 'mod'), c('click', 'shift')] },
        { label: 'Star what is picked, or under the cursor', keys: [['S']] },
        { label: 'Pick everything the search matches', keys: [c('A', 'mod')] },
        { label: 'Put everything back', keys: [['Esc']] },
      ],
    },
    {
      title: 'Viewer',
      items: [
        { label: 'Previous · next asset', keys: [['←'], ['→']] },
        { label: 'Fit to the window · actual size', keys: [['F'], ['1']] },
        { label: 'Show or hide details', keys: [['I']] },
        { label: 'Close', keys: [['Space'], ['Esc']] },
      ],
    },
    {
      title: 'Window',
      items: [
        { label: 'Zoom', keys: [c('+', 'mod'), c('−', 'mod'), c('0', 'mod')] },
        { label: 'Full screen', keys: mac ? [c('F', 'ctrl', 'mod')] : [['F11']] },
      ],
    },
  ];
}
