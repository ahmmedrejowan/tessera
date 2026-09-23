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
