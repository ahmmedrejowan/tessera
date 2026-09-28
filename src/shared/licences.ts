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
  // Without this, "CC BY-NC-ND" matched the by-nc test first and was recorded as CC BY-NC, which
  // says a work may be changed. It may not, and for game assets that is the clause most likely to
  // be broken by accident: rescaling a texture is a derivative.
  cc('CC-BY-NC-ND-4.0', 'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0', 'CC BY-NC-ND 4.0', 'https://creativecommons.org/licenses/by-nc-nd/4.0/', { commercial: false, modify: false }),
  // The OFL asks that its copyright notice and the licence itself travel with the font, so a
  // credits line is the least it needs. Marked as needing no attribution, it was never mentioned
  // in the credits or in the warnings before a copy.
  cc('OFL-1.1', 'SIL Open Font License 1.1', 'OFL', 'https://openfontlicense.org', {}),
  cc('Apache-2.0', 'Apache License 2.0', 'Apache 2.0', 'https://www.apache.org/licenses/LICENSE-2.0', {}),
  cc('MIT', 'MIT License', 'MIT', 'https://opensource.org/license/mit', {}),
  { id: 'royalty-free', name: 'Royalty-free (bought)', short: 'Royalty-free', url: null, commercial: true, attribution: false, shareAlike: false, modify: true, free: false },
  { id: 'unity-asset-store', name: 'Unity Asset Store EULA', short: 'Asset Store', url: 'https://unity.com/legal/as-terms', commercial: true, attribution: false, shareAlike: false, modify: true, free: false },
  { id: 'fab-standard', name: 'Fab Standard License', short: 'Fab', url: 'https://www.fab.com/eula', commercial: true, attribution: false, shareAlike: false, modify: true, free: false },
  { id: 'subscription', name: 'Subscription (while subscribed)', short: 'Subscription', url: null, commercial: true, attribution: false, shareAlike: false, modify: true, free: false },
  { id: 'personal', name: 'Personal use only', short: 'Personal', url: null, commercial: false, attribution: false, shareAlike: false, modify: true, free: true },
  { id: 'custom', name: 'Custom licence (see proof)', short: 'Custom', url: null, commercial: false, attribution: false, shareAlike: false, modify: true, free: true },
  // Your own work: nobody to credit, nothing to check, and no terms to keep to.
  { id: 'own-work', name: 'My own work', short: 'Mine', url: null, commercial: true, attribution: false, shareAlike: false, modify: true, free: true },
];

/** The licence for something you made yourself. */
export const OWN_WORK = 'own-work';

const BY_ID = new Map(LICENCES.map((l) => [l.id.toLowerCase(), l]));

export function licenceInfo(id: string | null | undefined): LicenceInfo | null {
  return id ? (BY_ID.get(id.toLowerCase()) ?? null) : null;
}

/**
 * Recognise a licence from the text of a licence or readme file. Checks the most specific wording
 * first, so "Attribution-NonCommercial" is never read as plain "Attribution".
 */
export function detectLicence(text: string): string | null {
  const t = text
    .replace(/\s+/g, ' ')
    // Every Creative Commons 4.0 legal text ends by dedicating the text of the licence itself to
    // the public domain under CC0. That sentence is about the wording of the licence, not about
    // the work it covers, and reading it as the work's licence turned the official text of
    // CC BY-NC into "public domain, no credit needed". Which is this application's worst possible
    // mistake, made on the most ordinary input there is: a pack that ships the real licence file.
    .replace(/the text of the creative commons public licen[cs]es is dedicated to the public domain under the cc0 public domain dedication\.?/gi, ' ')
    .replace(/creative commons has dedicated[^.]*cc0[^.]*\./gi, ' ');
  const version = (re: RegExp) => (re.exec(t)?.[1] === '3.0' ? '3.0' : '4.0');
  // Most restrictive first, and CC0 last of the Creative Commons family. Where a file names more
  // than one, the stricter reading is the safe one to be wrong about: crediting something that
  // needed no credit costs a line of text, and the other way round costs a takedown.
  if (/by-nc-nd|attribution-noncommercial-noderiv/i.test(t)) return 'CC-BY-NC-ND-4.0';
  if (/by-nc-sa|attribution-noncommercial-sharealike/i.test(t)) return 'CC-BY-NC-SA-4.0';
  // Only the licence's own wording: "free for commercial and non-commercial use" is not NC.
  if (/by-nc|attribution-noncommercial/i.test(t)) return 'CC-BY-NC-4.0';
  if (/by-nd|attribution-noderivs|noderivatives/i.test(t)) return 'CC-BY-ND-4.0';
  if (/by-sa|attribution-sharealike/i.test(t)) return `CC-BY-SA-${version(/(?:by-sa|sharealike)[ /]*(\d\.\d)/i)}`;
  // The last pattern is the title line of the official file, which says only "Attribution 4.0
  // International" without the words "Creative Commons" anywhere near it. The stricter members of
  // the family are tested above, so by this point "Attribution" on its own means plain BY.
  if (/creativecommons\.org\/licenses\/by\/|creative commons attribution|\bcc[- ]by\b|\battribution[ -]\d\.\d international\b/i.test(t))
    return `CC-BY-${version(/(?:licenses\/by\/|attribution[ -]|cc[- ]by[ -])(\d\.\d)/i)}`;
  // \bcc0\b, not cc0: a stylesheet colour of #cc0000 in a readme used to make a pack public domain.
  if (/creative ?commons zero|\bcc0\b|public ?domain dedication|publicdomain\/zero/i.test(t)) return 'CC0-1.0';
  if (/sil open font license|\bOFL\b/i.test(t)) return 'OFL-1.1';
  if (/apache license,? version 2\.0/i.test(t)) return 'Apache-2.0';
  if (/permission is hereby granted, free of charge/i.test(t)) return 'MIT';
  return null;
}
