import { describe, expect, it } from 'vitest';
import { detectLicense, licenseInfo } from '@shared/licenses';
import { sourceFromName, sourceFromText, sourceFromUrl } from '@shared/sources';

describe('license detection', () => {
  it.each([
    ['License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/', 'CC0-1.0'],
    ['Licensed under CC BY 3.0: credit Lorc', 'CC-BY-3.0'],
    ['This work is licensed under a Creative Commons Attribution 4.0 International License.', 'CC-BY-4.0'],
    ['https://creativecommons.org/licenses/by-sa/3.0/', 'CC-BY-SA-3.0'],
    ['Attribution-NonCommercial-ShareAlike 4.0 International', 'CC-BY-NC-SA-4.0'],
    ['Attribution-NonCommercial 4.0', 'CC-BY-NC-4.0'],
    ['This Font Software is licensed under the SIL Open Font License, Version 1.1.', 'OFL-1.1'],
    ['Permission is hereby granted, free of charge, to any person obtaining a copy', 'MIT'],
  ])('reads %s', (text, id) => {
    expect(detectLicense(text)).toBe(id);
  });

  it('does not mistake "free for commercial and non-commercial use" for a non-commercial license', () => {
    expect(detectLicense('Free for commercial and non-commercial use.')).toBeNull();
  });

  it('knows what each license allows', () => {
    expect(licenseInfo('cc0-1.0')).toMatchObject({ commercial: true, attribution: false });
    expect(licenseInfo('CC-BY-NC-4.0')).toMatchObject({ commercial: false });
    expect(licenseInfo('nope')).toBeNull();
  });
});

describe('source detection', () => {
  it('recognizes sites from links, file names and readme text', () => {
    expect(sourceFromUrl('https://www.kenney.nl/assets/city-kit')?.id).toBe('kenney');
    expect(sourceFromUrl('https://kaylousberg.itch.io/kaykit-dungeon')?.id).toBe('kaykit');
    expect(sourceFromUrl('https://someone.itch.io/pack')?.id).toBe('itch');
    expect(sourceFromUrl('not a url')).toBeNull();
    expect(sourceFromName('kenney_city-kit-roads.zip')?.id).toBe('kenney');
    expect(sourceFromName('Bricks076_2K-JPG.zip')?.id).toBe('ambientcg');
    expect(sourceFromText('Made by Quaternius. Support me on Patreon')?.id).toBe('quaternius');
  });
});

describe('the license file a pack actually ships', () => {
  // Every Creative Commons 4.0 legal text ends with this sentence. It is about the wording of the
  // license, not about the work it covers, and reading it as the work's license turned the
  // official text of CC BY-NC into "public domain, credit nobody" and sent the pack straight past
  // Review into the library. The most ordinary input there is, answered in the worst way.
  const FOOTER = 'The text of the Creative Commons public licenses is dedicated to the public domain under the CC0 Public Domain Dedication.';

  it('is read as the license it is, not as the CC0 sentence inside it', () => {
    expect(detectLicense(`Attribution-NonCommercial 4.0 International Public License. ${FOOTER}`)).toBe('CC-BY-NC-4.0');
    expect(detectLicense(`Attribution 4.0 International Public License. ${FOOTER}`)).toBe('CC-BY-4.0');
    expect(detectLicense(`Attribution-ShareAlike 4.0 International. ${FOOTER}`)).toBe('CC-BY-SA-4.0');
    expect(detectLicense(`Attribution-NoDerivatives 4.0 International. ${FOOTER}`)).toBe('CC-BY-ND-4.0');
  });

  it('still reads a real CC0 file as CC0', () => {
    expect(detectLicense('CC0 1.0 Universal Public Domain Dedication')).toBe('CC0-1.0');
    expect(detectLicense('Creative Commons Zero v1.0 Universal')).toBe('CC0-1.0');
  });

  it('takes the stricter one when a file names two', () => {
    // Being wrong towards the strict side costs a credit line nobody needed. The other way round
    // costs a takedown.
    expect(detectLicense('Models: CC BY-NC 4.0. Textures: CC0.')).toBe('CC-BY-NC-4.0');
    expect(detectLicense('This pack is CC BY 4.0 (unlike our CC0 packs), please credit us.')).toBe('CC-BY-4.0');
  });

  it('does not read a color in a stylesheet as a license', () => {
    expect(detectLicense('h1 { color: #cc0000 } This pack is Attribution-NonCommercial 4.0')).toBe('CC-BY-NC-4.0');
    expect(detectLicense('h1 { color: #cc0000 }')).toBeNull();
  });
});

describe('licenses that are easy to record too loosely', () => {
  it('keeps NoDerivatives out of the license that allows changes', () => {
    // "CC BY-NC-ND" used to match the by-nc test and be recorded as CC BY-NC, which says a work
    // may be changed. Rescaling a texture is a derivative, so this is the clause a game breaks
    // by accident.
    expect(detectLicense('Creative Commons Attribution-NonCommercial-NoDerivatives 4.0')).toBe('CC-BY-NC-ND-4.0');
    expect(detectLicense('CC BY-NC-ND 4.0')).toBe('CC-BY-NC-ND-4.0');
    expect(licenseInfo('CC-BY-NC-ND-4.0')?.modify).toBe(false);
    expect(licenseInfo('CC-BY-NC-ND-4.0')?.commercial).toBe(false);
  });

  it('asks for a font license to be credited', () => {
    // The OFL wants its notice and text to travel with the font. Marked as needing no
    // attribution, it was never mentioned in the credits or before a copy.
    expect(licenseInfo('OFL-1.1')?.attribution).toBe(true);
  });
});

describe('license names written the way people write them', () => {
  it('reads the parts whether they are hyphenated, spaced or run together', () => {
    // "CC BY NC 4.0" with spaces used to be read as plain CC BY, so a non-commercial pack was
    // recorded as free to sell. The 3.0 texts spell the clauses out in words, and missed too.
    expect(detectLicense('Licensed under CC BY NC 4.0')).toBe('CC-BY-NC-4.0');
    expect(detectLicense('Licensed under CC BY NC ND 4.0')).toBe('CC-BY-NC-ND-4.0');
    expect(detectLicense('Attribution-No Derivative Works 3.0 United States')).toBe('CC-BY-ND-4.0');
    expect(detectLicense('Attribution-Share Alike 3.0 Unported')).toBe('CC-BY-SA-3.0');
    expect(detectLicense('Attribution-Noncommercial-No Derivative Works 3.0')).toBe('CC-BY-NC-ND-4.0');
  });

  it('still does not read "non-commercial use" in ordinary prose as the NC license', () => {
    expect(detectLicense('Free for commercial and non-commercial use.')).toBeNull();
  });
});
