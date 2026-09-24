import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { kitDetails } from '../src/main/backup/kit';
import { generatePassword, KEYCHAIN_SERVICE, recoveryKitHtml, removeFromKeychain, saveToKeychain } from '../src/main/backup/password';

describe('backup passwords', () => {
  it('generates strong passwords that are easy to read back', () => {
    const a = generatePassword();
    expect(a).toMatch(/^([2-9A-HJ-NP-TV-Z]{4}-){5}[2-9A-HJ-NP-TV-Z]{4}$/);
    expect(a).not.toBe(generatePassword());
  });

  it('writes a recovery kit with the place, the password and the steps; keys only when asked', () => {
    const target = { provider: 'aws' as const, values: { bucket: 'b', region: 'eu-west-1', accessKey: 'AKIA1', secretKey: 'SECRET', prefix: 'tessera/' } };
    expect(kitDetails(target, false)).toEqual([
      ['Bucket', 'b'],
      ['Region', 'eu-west-1'],
      ['Access key ID', 'AKIA1'],
      ['Folder in the bucket', 'tessera/'],
      ['Keys', 'Not written here: keep them with this page, or in your password manager.'],
    ]);
    expect(kitDetails(target, true)).toContainEqual(['Secret access key', 'SECRET']);
    const html = recoveryKitHtml({ library: 'A <b>lib</b>', where: 'Amazon S3 · b/tessera/', details: kitDetails(target, false), password: 'P<&>W', date: 'today' });
    expect(html).toContain('P&lt;&amp;&gt;W');
    expect(html).toContain('A &lt;b&gt;lib&lt;/b&gt;');
    expect(html).toContain('From a backup');
    expect(html).not.toContain('SECRET');
  });
});

describe('when the system has no password store', () => {
  // Each of these asks for the other systems' way of doing it, which needs a program that is not
  // on this one: what is being tested is the answer a person gets, not the store itself.
  it.skipIf(process.platform === 'win32')('says the Windows store is not available', async () => {
    await expect(saveToKeychain('someone', 'a password', 'win32')).rejects.toThrow(/isn’t available/);
  });

  it.skipIf(process.platform === 'linux')('names the package Linux needs', async () => {
    await expect(saveToKeychain('someone', 'a password', 'linux')).rejects.toThrow(/libsecret-tools/);
  });

  it.skipIf(process.platform === 'darwin')('says the macOS store is not available', async () => {
    await expect(saveToKeychain('someone', 'a password', 'darwin')).rejects.toThrow(/isn’t available/);
  });
});

describe.skipIf(process.platform !== 'darwin')('the macOS keychain', () => {
  it('keeps a visible copy of the password, fed in without a command line', async () => {
    const account = `tessera-test-${Date.now()}`;
    try {
      await saveToKeychain(account, 'pa"ss wo\\rd');
      const out = execFileSync('security', ['find-generic-password', '-a', account, '-s', KEYCHAIN_SERVICE, '-w']).toString().trim();
      expect(out).toBe('pa"ss wo\\rd');
    } finally {
      await removeFromKeychain(account);
    }
  });
});
