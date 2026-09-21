/**
 * Licences Tessera knows. Each says what a game may do with an asset under it, which drives the
 * licence health checks and the credits file. Ids follow SPDX where one exists.
 */

export interface LicenceInfo {
  id: string;
  name: string;
  short: string;
  url: string | null;
  /** May it ship in a game that is sold or monetised? */
  commercial: boolean;
  /** Must the author be credited? */
  attribution: boolean;
  /** Must changed versions of the asset be shared under the same licence? */
  shareAlike: boolean;
  /** May the asset be modified? */
  modify: boolean;
  /** Free of charge (as opposed to bought or subscribed). */
  free: boolean;
}

const cc = (id: string, name: string, short: string, url: string, o: Partial<LicenceInfo>): LicenceInfo => ({
  id, name, short, url, commercial: true, attribution: true, shareAlike: false, modify: true, free: true, ...o,
});

export const LICENCES: LicenceInfo[] = [
  cc('CC0-1.0', 'Creative Commons Zero 1.0 (public domain)', 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/', { attribution: false }),
  cc('CC-BY-4.0', 'Creative Commons Attribution 4.0', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/', {}),
  cc('CC-BY-3.0', 'Creative Commons Attribution 3.0', 'CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/', {}),
  cc('CC-BY-SA-4.0', 'Creative Commons Attribution-ShareAlike 4.0', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', { shareAlike: true }),
  cc('CC-BY-SA-3.0', 'Creative Commons Attribution-ShareAlike 3.0', 'CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/', { shareAlike: true }),
  cc('CC-BY-NC-4.0', 'Creative Commons Attribution-NonCommercial 4.0', 'CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0/', { commercial: false }),
  cc('CC-BY-NC-SA-4.0', 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0', 'CC BY-NC-SA 4.0', 'https://creativecommons.org/licenses/by-nc-sa/4.0/', { commercial: false, shareAlike: true }),
  cc('CC-BY-ND-4.0', 'Creative Commons Attribution-NoDerivatives 4.0', 'CC BY-ND 4.0', 'https://creativecommons.org/licenses/by-nd/4.0/', { modify: false }),
  cc('OFL-1.1', 'SIL Open Font License 1.1', 'OFL', 'https://openfontlicense.org', { attribution: false }),
  cc('Apache-2.0', 'Apache License 2.0', 'Apache 2.0', 'https://www.apache.org/licenses/LICENSE-2.0', {}),
  cc('MIT', 'MIT License', 'MIT', 'https://opensource.org/license/mit', {}),
  { id: 'royalty-free', name: 'Royalty-free (bought)', short: 'Royalty-free', url: null, commercial: true, attribution: false, shareAlike: false, modify: true, free: false },
  { id: 'unity-asset-store', name: 'Unity Asset Store EULA', short: 'Asset Store', url: 'https://unity.com/legal/as-terms', commercial: true, attribution: false, shareAlike: false, modify: true, free: false },
  { id: 'fab-standard', name: 'Fab Standard License', short: 'Fab', url: 'https://www.fab.com/eula', commercial: true, attribution: false, shareAlike: false, modify: true, free: false },
  { id: 'subscription', name: 'Subscription (while subscribed)', short: 'Subscription', url: null, commercial: true, attribution: false, shareAlike: false, modify: true, free: false },
  { id: 'personal', name: 'Personal use only', short: 'Personal', url: null, commercial: false, attribution: false, shareAlike: false, modify: true, free: true },
  { id: 'custom', name: 'Custom licence (see proof)', short: 'Custom', url: null, commercial: false, attribution: false, shareAlike: false, modify: true, free: true },
];

const BY_ID = new Map(LICENCES.map((l) => [l.id.toLowerCase(), l]));

export function licenceInfo(id: string | null | undefined): LicenceInfo | null {
  return id ? (BY_ID.get(id.toLowerCase()) ?? null) : null;
}

/**
 * Recognise a licence from the text of a licence or readme file. Checks the most specific wording
 * first, so "Attribution-NonCommercial" is never read as plain "Attribution".
 */
export function detectLicence(text: string): string | null {
  const t = text.replace(/\s+/g, ' ');
  const version = (re: RegExp) => (re.exec(t)?.[1] === '3.0' ? '3.0' : '4.0');
  if (/creative ?commons zero|cc0|public ?domain dedication|publicdomain\/zero/i.test(t)) return 'CC0-1.0';
  if (/by-nc-sa|attribution-noncommercial-sharealike/i.test(t)) return 'CC-BY-NC-SA-4.0';
  // Only the licence's own wording: "free for commercial and non-commercial use" is not NC.
  if (/by-nc|attribution-noncommercial/i.test(t)) return 'CC-BY-NC-4.0';
  if (/by-nd|attribution-noderivs|noderivatives/i.test(t)) return 'CC-BY-ND-4.0';
  if (/by-sa|attribution-sharealike/i.test(t)) return `CC-BY-SA-${version(/(?:by-sa|sharealike)[ /]*(\d\.\d)/i)}`;
  if (/creativecommons\.org\/licenses\/by\/|creative commons attribution|\bcc[- ]by\b/i.test(t)) return `CC-BY-${version(/(?:licenses\/by\/|attribution |cc[- ]by[ -])(\d\.\d)/i)}`;
  if (/sil open font license|\bOFL\b/i.test(t)) return 'OFL-1.1';
  if (/apache license,? version 2\.0/i.test(t)) return 'Apache-2.0';
  if (/permission is hereby granted, free of charge/i.test(t)) return 'MIT';
  return null;
}
