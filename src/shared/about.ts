/** Facts about Tessera itself: where it lives, what it is made of, and how to reach its author. */

export const LINKS = {
  repo: 'https://github.com/ahmmedrejowan/tessera',
  issues: 'https://github.com/ahmmedrejowan/tessera/issues',
  email: 'kmrejowan@gmail.com',
};

/** Tessera's own terms. */
export const LICENCE = {
  id: 'GPL-3.0-or-later',
  name: 'GNU General Public License, version 3 or later',
  /** The freedoms the licence gives, in a line. */
  summary: 'Free software: use it for anything, read how it works, change it, and pass it on — as long as what you pass on stays free in the same way.',
};

/** The separate programs Tessera can fetch and drive; each stays its own project. */
export const HELPERS = [
  { name: 'Kopia', licence: 'Apache-2.0', url: 'https://kopia.io', what: 'Encrypted backups' },
  { name: 'rclone', licence: 'MIT', url: 'https://rclone.org', what: 'Cloud drives for backups' },
  { name: 'Syncthing', licence: 'MPL-2.0', url: 'https://syncthing.net', what: 'Sync between your computers' },
];

/** What Tessera itself is built from. */
export const BUILT_WITH = [
  { name: 'Electron', licence: 'MIT', url: 'https://electronjs.org' },
  { name: 'React', licence: 'MIT', url: 'https://react.dev' },
  { name: 'MUI', licence: 'MIT', url: 'https://mui.com' },
  { name: 'three.js', licence: 'MIT', url: 'https://threejs.org' },
  { name: 'TanStack Query', licence: 'MIT', url: 'https://tanstack.com/query' },
  { name: 'Zod', licence: 'MIT', url: 'https://zod.dev' },
  { name: 'yauzl', licence: 'MIT', url: 'https://github.com/thejoshwolfe/yauzl' },
  { name: 'Roboto Flex', licence: 'OFL-1.1', url: 'https://fonts.google.com/specimen/Roboto+Flex' },
];
