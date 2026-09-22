import { describe, expect, it } from 'vitest';
import { makeScrubber } from '../src/main/reports/scrub';

const scrub = makeScrubber({
  app: '/Applications/Tessera.app/Contents/Resources/app.asar',
  home: '/Users/sam',
  data: '/Users/sam/Library/Application Support/Tessera',
  temp: '/var/folders/xy/T',
  library: '/Users/sam/Documents/Game Library',
});

const win = makeScrubber({
  app: 'C:\\Program Files\\Tessera\\resources\\app.asar',
  home: 'C:\\Users\\Sam',
  data: 'C:\\Users\\Sam\\AppData\\Roaming\\Tessera',
  temp: 'C:\\Users\\Sam\\AppData\\Local\\Temp',
  library: 'D:\\Assets\\Library',
});

describe('scrubbing reports', () => {
  it('keeps the app’s own code paths readable', () => {
    expect(scrub('at copy (/Applications/Tessera.app/Contents/Resources/app.asar/out/main/index.js:120:7)')).toBe('at copy (app://out/main/index.js:120:7)');
    expect(scrub('at file:///Applications/Tessera.app/Contents/Resources/app.asar/out/renderer/assets/index-abc.js:3:9')).toBe('at app://out/renderer/assets/index-abc.js:3:9');
  });

  it('hides the names of files in the library, keeping the extension', () => {
    expect(scrub("ENOENT: no such file or directory, open '/Users/sam/Documents/Game Library/packs/Kenney City/original/city.zip'")).toBe("ENOENT: no such file or directory, open '<library>/….zip'");
  });

  it('hides the user name in home paths, quoted or not', () => {
    expect(scrub('reading /Users/sam/Downloads/secret-project/model.fbx failed')).toBe('reading ~/….fbx failed');
    expect(scrub('"/Users/sam/Desktop/My Stuff"')).toBe('"~/…"');
  });

  it('isn’t fooled by apostrophes', () => {
    expect(scrub("Couldn't read '/Users/sam/Documents/Private Stuff/model.fbx'")).toBe("Couldn't read '~/….fbx'");
    expect(scrub('It isn’t “Secret Pack”, it’s fine')).toBe('It isn’t “…”, it’s fine');
  });

  it('hides paths elsewhere', () => {
    expect(scrub("EACCES: permission denied, mkdir '/Volumes/Assets Drive/Tessera'")).toBe("EACCES: permission denied, mkdir '<path>/…'");
    expect(scrub('opened /Volumes/Drive/packs/tree.glb')).toBe('opened <path>/….glb');
  });

  it('handles Windows paths', () => {
    expect(win('at x (C:\\Program Files\\Tessera\\resources\\app.asar\\out\\main\\index.js:5:1)')).toBe('at x (app://out/main/index.js:5:1)');
    expect(win("open 'D:\\Assets\\Library\\packs\\Forest\\tree.png'")).toBe("open '<library>/….png'");
    expect(win('in C:\\Users\\Sam\\Documents\\notes.txt')).toBe('in ~/….txt');
    expect(win('in E:\\Other\\thing.obj')).toBe('in <path>/….obj');
  });

  it('removes quoted names, emails, device IDs, IPs and URL queries', () => {
    expect(scrub('“Kenney City Kit” isn’t in the library')).toBe('“…” isn’t in the library');
    expect(scrub("code 'library-missing'")).toBe("code 'library-missing'");
    expect(scrub('from sam.smith@example.com')).toBe('from <email>');
    expect(scrub('device ABCDEFG-HIJKLMN-OPQRSTU-VWXYZ23-4567ABC-DEFGHIJ-KLMNOPQ-RSTUVWX refused')).toBe('device <device> refused');
    expect(scrub('connect ECONNREFUSED 192.168.1.20:22000')).toBe('connect ECONNREFUSED <ip>:22000');
    expect(scrub('GET https://example.com/a/b?token=abc failed')).toBe('GET https://example.com/a/b failed');
  });

  it('leaves ordinary messages alone', () => {
    const plain = "TypeError: Cannot read properties of undefined (reading 'name')";
    expect(scrub(plain)).toBe(plain);
    expect(scrub('3/4 done')).toBe('3/4 done');
  });
});
