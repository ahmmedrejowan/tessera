import { describe, expect, it } from 'vitest';
import { expectedHash, TOOLS } from '../src/main/tools/install';

const assetName = TOOLS.syncthing.asset;

describe('getting Syncthing and Kopia', () => {
  it('picks the release file for each system', () => {
    expect(assetName('darwin', 'arm64', 'v2.1.5')).toBe('syncthing-macos-arm64-v2.1.5.zip');
    expect(assetName('win32', 'x64', 'v2.1.5')).toBe('syncthing-windows-amd64-v2.1.5.zip');
    expect(assetName('linux', 'arm64', 'v2.1.5')).toBe('syncthing-linux-arm64-v2.1.5.tar.gz');
    expect(assetName('linux', 'ppc64', 'v2.1.5')).toBeNull();
  });

  it('picks Kopia’s release file for each system', () => {
    expect(TOOLS.kopia.asset('darwin', 'arm64', 'v0.23.1')).toBe('kopia-0.23.1-macOS-arm64.tar.gz');
    expect(TOOLS.kopia.asset('win32', 'x64', 'v0.23.1')).toBe('kopia-0.23.1-windows-x64.zip');
    expect(TOOLS.kopia.asset('linux', 'x64', 'v0.23.1')).toBe('kopia-0.23.1-linux-x64.tar.gz');
    expect(TOOLS.kopia.asset('win32', 'arm64', 'v0.23.1')).toBeNull();
  });

  it('picks rclone’s release file for each system', () => {
    expect(TOOLS.rclone.asset('darwin', 'arm64', 'v1.75.1')).toBe('rclone-v1.75.1-osx-arm64.zip');
    expect(TOOLS.rclone.asset('win32', 'x64', 'v1.75.1')).toBe('rclone-v1.75.1-windows-amd64.zip');
    expect(TOOLS.rclone.asset('linux', 'x64', 'v1.75.1')).toBe('rclone-v1.75.1-linux-amd64.zip');
  });

  it('reads the hash from the signed sums file', () => {
    const sums = `-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\n${'a'.repeat(64)}  syncthing-macos-arm64-v2.1.5.zip\n${'B'.repeat(64)}  syncthing-linux-amd64-v2.1.5.tar.gz\n-----BEGIN PGP SIGNATURE-----\n`;
    expect(expectedHash(sums, 'syncthing-linux-amd64-v2.1.5.tar.gz')).toBe('b'.repeat(64));
    expect(expectedHash(sums, 'syncthing-windows-amd64-v2.1.5.zip')).toBeNull();
  });
});
