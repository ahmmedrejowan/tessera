/** Facts about Tessera itself: where it lives, what it is made of, and how to reach its author. */

export const LINKS = {
  /** Tessera's own page: what it is, what it can do, and where to get it. */
  site: 'https://tessera.rejowan.com',
  repo: 'https://github.com/ahmmedrejowan/tessera',
  issues: 'https://github.com/ahmmedrejowan/tessera/issues',
  email: 'hello@rejowan.com',
};

/** The person behind Tessera, as the About page shows them. */
export const CREATOR = {
  name: 'K M Rejowan Ahmmed',
  title: 'Senior Android Developer',
  /** Why Tessera exists, in their own words. */
  about:
    'Tessera came out of my own mess of downloaded asset packs: zips in a folder, no idea which ones I was allowed to ship, and credits written from memory at the end. It keeps every pack with its license and source on record, so the answer is there when the game is.',
  links: [
    { label: 'Website', value: 'rejowan.com', url: 'https://rejowan.com', icon: 'site' },
    { label: 'Email', value: LINKS.email, url: `mailto:${LINKS.email}`, icon: 'mail' },
    { label: 'GitHub', value: 'github.com/ahmmedrejowan', url: 'https://github.com/ahmmedrejowan', icon: 'code' },
    { label: 'LinkedIn', value: 'linkedin.com/in/ahmmedrejowan', url: 'https://linkedin.com/in/ahmmedrejowan', icon: 'work' },
  ] as { label: string; value: string; url: string; icon: 'site' | 'mail' | 'code' | 'work' }[],
};

/** Tessera's own terms. */
export const LICENSE = {
  id: 'GPL-3.0-or-later',
  name: 'GNU General Public License, version 3 or later',
  /** The freedoms the license gives, in a line. */
  summary: 'Free software: use it for anything, read how it works, change it, and pass it on, as long as what you pass on stays free in the same way.',
};

/** The separate programs Tessera can fetch and drive; each stays its own project. */
export const HELPERS = [
  { name: 'Kopia', license: 'Apache-2.0', url: 'https://kopia.io', what: 'Encrypted backups' },
  { name: 'rclone', license: 'MIT', url: 'https://rclone.org', what: 'Cloud drives for backups' },
  { name: 'Syncthing', license: 'MPL-2.0', url: 'https://syncthing.net', what: 'Sync between your computers' },
];

/** What Tessera itself is built from. */
export const BUILT_WITH = [
  { name: 'Electron', license: 'MIT', url: 'https://electronjs.org' },
  { name: 'React', license: 'MIT', url: 'https://react.dev' },
  { name: 'MUI', license: 'MIT', url: 'https://mui.com' },
  { name: 'three.js', license: 'MIT', url: 'https://threejs.org' },
  { name: 'TanStack Query', license: 'MIT', url: 'https://tanstack.com/query' },
  { name: 'Zod', license: 'MIT', url: 'https://zod.dev' },
  { name: 'yauzl', license: 'MIT', url: 'https://github.com/thejoshwolfe/yauzl' },
  { name: 'Roboto Flex', license: 'OFL-1.1', url: 'https://fonts.google.com/specimen/Roboto+Flex' },
];
