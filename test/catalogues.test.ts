import { describe, expect, it } from 'vitest';
import { detectLicence, licenceInfo } from '@shared/licences';
import { sourceFromName, sourceFromText, sourceFromUrl } from '@shared/sources';

describe('licence detection', () => {
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
    expect(detectLicence(text)).toBe(id);
  });

  it('does not mistake "free for commercial and non-commercial use" for a non-commercial licence', () => {
    expect(detectLicence('Free for commercial and non-commercial use.')).toBeNull();
  });

  it('knows what each licence allows', () => {
    expect(licenceInfo('cc0-1.0')).toMatchObject({ commercial: true, attribution: false });
    expect(licenceInfo('CC-BY-NC-4.0')).toMatchObject({ commercial: false });
    expect(licenceInfo('nope')).toBeNull();
  });
});

describe('source detection', () => {
  it('recognises sites from links, file names and readme text', () => {
    expect(sourceFromUrl('https://www.kenney.nl/assets/city-kit')?.id).toBe('kenney');
    expect(sourceFromUrl('https://kaylousberg.itch.io/kaykit-dungeon')?.id).toBe('kaykit');
    expect(sourceFromUrl('https://someone.itch.io/pack')?.id).toBe('itch');
    expect(sourceFromUrl('not a url')).toBeNull();
    expect(sourceFromName('kenney_city-kit-roads.zip')?.id).toBe('kenney');
    expect(sourceFromName('Bricks076_2K-JPG.zip')?.id).toBe('ambientcg');
    expect(sourceFromText('Made by Quaternius. Support me on Patreon')?.id).toBe('quaternius');
  });
});

describe('the licence file a pack actually ships', () => {
  // Every Creative Commons 4.0 legal text ends with this sentence. It is about the wording of the
  // licence, not about the work it covers, and reading it as the work's licence turned the
  // official text of CC BY-NC into "public domain, credit nobody" and sent the pack straight past
  // Review into the library. The most ordinary input there is, answered in the worst way.
  const FOOTER = 'The text of the Creative Commons public licenses is dedicated to the public domain under the CC0 Public Domain Dedication.';

  it('is read as the licence it is, not as the CC0 sentence inside it', () => {
    expect(detectLicence(`Attribution-NonCommercial 4.0 International Public License. ${FOOTER}`)).toBe('CC-BY-NC-4.0');
    expect(detectLicence(`Attribution 4.0 International Public License. ${FOOTER}`)).toBe('CC-BY-4.0');
    expect(detectLicence(`Attribution-ShareAlike 4.0 International. ${FOOTER}`)).toBe('CC-BY-SA-4.0');
    expect(detectLicence(`Attribution-NoDerivatives 4.0 International. ${FOOTER}`)).toBe('CC-BY-ND-4.0');
  });

  it('still reads a real CC0 file as CC0', () => {
    expect(detectLicence('CC0 1.0 Universal Public Domain Dedication')).toBe('CC0-1.0');
    expect(detectLicence('Creative Commons Zero v1.0 Universal')).toBe('CC0-1.0');
  });

  it('takes the stricter one when a file names two', () => {
    // Being wrong towards the strict side costs a credit line nobody needed. The other way round
    // costs a takedown.
    expect(detectLicence('Models: CC BY-NC 4.0. Textures: CC0.')).toBe('CC-BY-NC-4.0');
    expect(detectLicence('This pack is CC BY 4.0 (unlike our CC0 packs), please credit us.')).toBe('CC-BY-4.0');
  });

  it('does not read a colour in a stylesheet as a licence', () => {
    expect(detectLicence('h1 { color: #cc0000 } This pack is Attribution-NonCommercial 4.0')).toBe('CC-BY-NC-4.0');
    expect(detectLicence('h1 { color: #cc0000 }')).toBeNull();
  });
});

describe('licences that are easy to record too loosely', () => {
  it('keeps NoDerivatives out of the licence that allows changes', () => {
    // "CC BY-NC-ND" used to match the by-nc test and be recorded as CC BY-NC, which says a work
    // may be changed. Rescaling a texture is a derivative, so this is the clause a game breaks
    // by accident.
    expect(detectLicence('Creative Commons Attribution-NonCommercial-NoDerivatives 4.0')).toBe('CC-BY-NC-ND-4.0');
    expect(detectLicence('CC BY-NC-ND 4.0')).toBe('CC-BY-NC-ND-4.0');
    expect(licenceInfo('CC-BY-NC-ND-4.0')?.modify).toBe(false);
    expect(licenceInfo('CC-BY-NC-ND-4.0')?.commercial).toBe(false);
  });

  it('asks for a font licence to be credited', () => {
    // The OFL wants its notice and text to travel with the font. Marked as needing no
    // attribution, it was never mentioned in the credits or before a copy.
    expect(licenceInfo('OFL-1.1')?.attribution).toBe(true);
  });
});
