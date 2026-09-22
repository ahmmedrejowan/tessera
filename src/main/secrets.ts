import { safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { UserError } from './errors';
import type { SecretStore } from './backup/service';

/**
 * A secret kept in a file, encrypted by the operating system (Keychain on macOS, DPAPI on Windows,
 * the desktop keyring on Linux). Refuses to store it in the clear if no encryption is available.
 */
export function fileSecret(path: string): SecretStore {
  return {
    async save(secret) {
      if (!safeStorage.isEncryptionAvailable()) throw new UserError('no-keychain', 'This computer has no keychain Tessera can use to keep the password safe.');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, safeStorage.encryptString(secret));
    },
    async load() {
      try {
        return safeStorage.decryptString(await readFile(path));
      } catch {
        return null;
      }
    },
    async clear() {
      await rm(path, { force: true });
    },
  };
}
