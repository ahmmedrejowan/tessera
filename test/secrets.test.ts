import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Where a backup password is kept. Getting this wrong either loses somebody's backups or leaves
 * their password lying about, so both paths are checked: the keychain, and the file for a computer
 * that has none.
 */

let keychain = true;
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => keychain,
    getSelectedStorageBackend: () => (keychain ? 'gnome_libsecret' : 'basic_text'),
    // Not real encryption: enough to tell "the keychain wrote this" from "this is plain text",
    // and to leave nothing readable in the file.
    encryptString: (s: string) => Buffer.concat([Buffer.from('locked:'), Buffer.from(s, 'utf8').reverse()]),
    decryptString: (b: Buffer) => {
      if (!b.subarray(0, 7).equals(Buffer.from('locked:'))) throw new Error('not ours');
      return Buffer.from(b.subarray(7)).reverse().toString('utf8');
    },
  },
}));

const dir = mkdtempSync(join(tmpdir(), 'tessera-secrets-'));
const path = join(dir, 'passwords', 'backup');
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  keychain = true;
  rmSync(path, { force: true });
});

/** The store, freshly imported, so what it remembers about this computer is worked out again. */
const store = async (allowFile = () => false) => {
  vi.resetModules();
  const { fileSecret } = await import('../src/main/secrets');
  return fileSecret(path, allowFile);
};

/** macOS and Windows always have a keychain, so "no keychain" has to be a Linux without one. */
function onALinuxWithNoKeyring() {
  keychain = false;
  const was = process.platform;
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  return () => Object.defineProperty(process, 'platform', { value: was, configurable: true });
}

describe('a password, where there is a keychain', () => {
  it('goes in through the keychain, and comes back out', async () => {
    const secret = await store();
    await secret.save('correct horse battery staple');
    expect(readFileSync(path, 'utf8')).not.toContain('correct horse');
    expect(await secret.load()).toBe('correct horse battery staple');
  });

  it('is forgotten when it is cleared', async () => {
    const secret = await store();
    await secret.save('a password');
    await secret.clear();
    expect(existsSync(path)).toBe(false);
    expect(await secret.load()).toBeNull();
  });
});

describe('a password, where there is no keychain', () => {
  it('is refused unless the person has said a file is acceptable', async () => {
    const back = onALinuxWithNoKeyring();
    try {
      await expect((await store(() => false)).save('a password')).rejects.toThrow(/keychain/i);
      expect(existsSync(path)).toBe(false);
    } finally {
      back();
    }
  });

  it('is written in a file only its owner can read, when they have', async () => {
    const back = onALinuxWithNoKeyring();
    try {
      const secret = await store(() => true);
      await secret.save('a password');
      expect(readFileSync(path, 'utf8')).toContain('tessera-plain:');
      expect(await secret.load()).toBe('a password');
      // 0600: nobody else on this computer can read it.
      expect(statSync(path).mode & 0o077).toBe(0);
    } finally {
      back();
    }
  });
});

describe('a password file that cannot be read', () => {
  it('is treated as no password rather than as a crash', async () => {
    const secret = await store();
    writeFileSync(path, 'this is not what we wrote');
    expect(await secret.load()).toBeNull();
  });

  it('is treated as no password when it is not there at all', async () => {
    expect(await (await store()).load()).toBeNull();
  });
});
