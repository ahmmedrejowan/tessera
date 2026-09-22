import { safeStorage } from 'electron';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { UserError } from './errors';
import type { SecretStore } from './backup/service';

/** Marks a secret kept as-is in an owner-only file, where there is no keychain. */
const PLAIN = Buffer.from('tessera-plain:');

/**
 * Whether the operating system can really protect a secret: the Keychain on macOS, DPAPI on
 * Windows, a desktop keyring on Linux. On Linux without a keyring Electron falls back to a fixed
 * built-in key ("basic_text"), which protects nothing, so that counts as no keychain.
 */
export function keychainAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
  return true;
}

/**
 * A secret kept in a file, encrypted by the operating system's keychain. Without one it's kept
 * as it is in a file only this user can read (like an SSH key), but only when `allowFile` says
 * the user agreed to that.
 */
export function fileSecret(path: string, allowFile: () => boolean): SecretStore {
  return {
    async save(secret) {
      await mkdir(dirname(path), { recursive: true });
      if (keychainAvailable()) {
        await writeFile(path, safeStorage.encryptString(secret));
        return;
      }
      if (!allowFile()) throw new UserError('no-keychain', 'This computer has no keychain to keep the password safe.');
      await writeFile(path, Buffer.concat([PLAIN, Buffer.from(secret, 'utf8')]), { mode: 0o600 });
      await chmod(path, 0o600);
    },
    async load() {
      try {
        const data = await readFile(path);
        if (data.subarray(0, PLAIN.length).equals(PLAIN)) return data.subarray(PLAIN.length).toString('utf8');
        return safeStorage.decryptString(data);
      } catch {
        return null;
      }
    },
    async clear() {
      await rm(path, { force: true });
    },
  };
}
