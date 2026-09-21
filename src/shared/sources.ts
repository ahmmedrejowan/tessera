/**
 * Sites Tessera recognises. Knowing where a pack came from fills in its creator, usual licence and
 * link without the user typing them. Anything else is a free-text source.
 */

export interface SourceInfo {
  id: string;
  name: string;
  url: string;
  /** Host names that identify the site in a link. */
  hosts: string[];
  /** File or folder names typical of this site's downloads (tested against the download's name). */
  names?: RegExp;
  /** Words in a readme or licence file that identify the site. */
  text?: RegExp;
  /** Who made the packs, when the site is one creator. */
  creator?: string;
  /** The licence the site's packs usually carry. Always shown as a suggestion, never applied silently to paid sites. */
  licence?: string;
}

export const SOURCES: SourceInfo[] = [
  { id: 'kenney', name: 'Kenney', url: 'https://kenney.nl', hosts: ['kenney.nl'], names: /^kenney[_ -]/i, text: /kenney\.nl|www\.kenney/i, creator: 'Kenney', licence: 'CC0-1.0' },
  { id: 'quaternius', name: 'Quaternius', url: 'https://quaternius.com', hosts: ['quaternius.com'], names: /quaternius/i, text: /quaternius/i, creator: 'Quaternius', licence: 'CC0-1.0' },
  { id: 'kaykit', name: 'KayKit', url: 'https://kaylousberg.com', hosts: ['kaylousberg.com', 'kaylousberg.itch.io'], names: /^kaykit/i, text: /kaylousberg|kaykit/i, creator: 'Kay Lousberg', licence: 'CC0-1.0' },
  { id: 'poly-pizza', name: 'Poly Pizza', url: 'https://poly.pizza', hosts: ['poly.pizza'], text: /poly\.pizza/i },
  { id: 'poly-haven', name: 'Poly Haven', url: 'https://polyhaven.com', hosts: ['polyhaven.com'], text: /polyhaven/i, licence: 'CC0-1.0' },
  { id: 'ambientcg', name: 'ambientCG', url: 'https://ambientcg.com', hosts: ['ambientcg.com'], names: /_(1|2|4|8)K-(JPG|PNG)/, text: /ambientcg/i, creator: 'ambientCG', licence: 'CC0-1.0' },
  { id: 'opengameart', name: 'OpenGameArt', url: 'https://opengameart.org', hosts: ['opengameart.org'], text: /opengameart/i },
  { id: 'game-icons', name: 'game-icons.net', url: 'https://game-icons.net', hosts: ['game-icons.net'], names: /game-icons/i, text: /game-icons\.net/i, licence: 'CC-BY-3.0' },
  { id: 'google-fonts', name: 'Google Fonts', url: 'https://fonts.google.com', hosts: ['fonts.google.com'], licence: 'OFL-1.1' },
  { id: 'freesound', name: 'Freesound', url: 'https://freesound.org', hosts: ['freesound.org'], text: /freesound\.org/i },
  { id: 'sketchfab', name: 'Sketchfab', url: 'https://sketchfab.com', hosts: ['sketchfab.com'], text: /sketchfab/i },
  { id: 'itch', name: 'itch.io', url: 'https://itch.io', hosts: ['itch.io'] },
  { id: 'unity-asset-store', name: 'Unity Asset Store', url: 'https://assetstore.unity.com', hosts: ['assetstore.unity.com'], names: /\.unitypackage$/i },
  { id: 'fab', name: 'Fab', url: 'https://www.fab.com', hosts: ['fab.com', 'www.fab.com'] },
  { id: 'craftpix', name: 'CraftPix', url: 'https://craftpix.net', hosts: ['craftpix.net'], names: /craftpix/i, text: /craftpix/i },
  { id: 'gamedev-market', name: 'GameDev Market', url: 'https://www.gamedevmarket.net', hosts: ['gamedevmarket.net', 'www.gamedevmarket.net'], text: /gamedevmarket/i },
  { id: 'humble', name: 'Humble Bundle', url: 'https://www.humblebundle.com', hosts: ['humblebundle.com', 'www.humblebundle.com'] },
  { id: 'cgtrader', name: 'CGTrader', url: 'https://www.cgtrader.com', hosts: ['cgtrader.com', 'www.cgtrader.com'] },
  { id: 'turbosquid', name: 'TurboSquid', url: 'https://www.turbosquid.com', hosts: ['turbosquid.com', 'www.turbosquid.com'] },
];

const BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

export function sourceInfo(id: string | null | undefined): SourceInfo | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** The known site a link points at. */
export function sourceFromUrl(url: string): SourceInfo | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return SOURCES.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

/** The known site a download's file name suggests. */
export function sourceFromName(name: string): SourceInfo | null {
  return SOURCES.find((s) => s.names?.test(name)) ?? null;
}

/** The known site a readme or licence text mentions. */
export function sourceFromText(text: string): SourceInfo | null {
  return SOURCES.find((s) => s.text?.test(text)) ?? null;
}
