import { describe, expect, it } from 'vitest';
import { assetName, expectedHash } from '../src/main/sync/install';

describe('getting Syncthing', () => {
  it('picks the release file for each system', () => {
    expect(assetName('darwin', 'arm64', 'v2.1.5')).toBe('syncthing-macos-arm64-v2.1.5.zip');
    expect(assetName('win32', 'x64', 'v2.1.5')).toBe('syncthing-windows-amd64-v2.1.5.zip');
    expect(assetName('linux', 'arm64', 'v2.1.5')).toBe('syncthing-linux-arm64-v2.1.5.tar.gz');
    expect(assetName('linux', 'ppc64', 'v2.1.5')).toBeNull();
  });

  it('reads the hash from the signed sums file', () => {
    const sums = `-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\n${'a'.repeat(64)}  syncthing-macos-arm64-v2.1.5.zip\n${'B'.repeat(64)}  syncthing-linux-amd64-v2.1.5.tar.gz\n-----BEGIN PGP SIGNATURE-----\n`;
    expect(expectedHash(sums, 'syncthing-linux-amd64-v2.1.5.tar.gz')).toBe('b'.repeat(64));
    expect(expectedHash(sums, 'syncthing-windows-amd64-v2.1.5.zip')).toBeNull();
  });
});
