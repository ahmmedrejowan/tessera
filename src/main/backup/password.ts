import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { UserError } from '../errors';

/** Letters and digits that can't be mistaken for each other (no 0/O, 1/I/L, U). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A strong password to write down: 24 characters in groups of four, about 118 bits of chance,
 * easy to read back from paper.
 */
export function generatePassword(groups = 6): string {
  return Array.from({ length: groups }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')).join('-');
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface KitInput {
  library: string;
  where: string;
  /** Settings of the storage worth writing down (bucket, server, account; never keys unless asked). */
  details: [string, string][];
  password: string;
  date: string;
}

/** The recovery kit: one printable page with everything needed to restore on a new computer. */
export function recoveryKitHtml(k: KitInput): string {
  const rows = k.details.map(([a, b]) => `<tr><th>${escapeHtml(a)}</th><td>${escapeHtml(b)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Tessera recovery kit</title><style>
  body{font:14px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1b1c1f;margin:48px}
  h1{font-size:26px;margin:0 0 4px}p.sub{color:#555;margin:0 0 28px}
  .pw{font:600 22px/1.4 ui-monospace,Menlo,Consolas,monospace;letter-spacing:1px;padding:18px 20px;border:2px solid #1b1c1f;border-radius:12px;margin:8px 0 24px;word-break:break-all}
  table{border-collapse:collapse;width:100%;margin:8px 0 24px}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #ddd;vertical-align:top}th{width:30%;color:#555;font-weight:500}
  ol{padding-left:20px}h2{font-size:16px;margin:24px 0 6px}.warn{background:#fff4e5;border-radius:10px;padding:12px 16px}
  </style></head><body>
  <h1>Tessera recovery kit</h1><p class="sub">${escapeHtml(k.library)} · made ${escapeHtml(k.date)}</p>
  <h2>Backup password</h2><div class="pw">${escapeHtml(k.password)}</div>
  <h2>Where the backups are</h2><table><tr><th>Place</th><td>${escapeHtml(k.where)}</td></tr>${rows}</table>
  <h2>To restore on any computer</h2><ol><li>Install Tessera.</li><li>On the welcome screen, choose <b>From a backup</b>.</li><li>Pick the place above, sign in or enter its keys, and type the password.</li></ol>
  <p class="warn">Keep this page somewhere safe and private, away from the computer: a drawer, a safe, a password manager. Anyone with it can read the backups; without the password, no one can, not even you.</p>
  </body></html>`;
}

function run(cmd: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d: Buffer) => (err += d.toString()));
    p.on('error', (e) => reject(e));
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `${cmd} stopped with ${code}`))));
    p.stdin.end(input);
  });
}

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The name the saved password goes under in the keychain. */
export const KEYCHAIN_SERVICE = 'Tessera backup password';

/**
 * Save the backup password as a visible item in the system's password store: Keychain Access on
 * macOS, Credential Manager on Windows, the Secret Service (GNOME Keyring, KWallet) on Linux. The
 * password goes in through standard input, never on a command line.
 */
export async function saveToKeychain(account: string, password: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  try {
    if (platform === 'darwin') {
      // `security -i` reads commands from standard input.
      await run('security', ['-i'], `add-generic-password -U -a ${quote(account)} -s ${quote(KEYCHAIN_SERVICE)} -l ${quote(KEYCHAIN_SERVICE)} -w ${quote(password)}\n`);
    } else if (platform === 'win32') {
      const script = [
        '$pw = [Console]::In.ReadToEnd()',
        '[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]',
        '$v = New-Object Windows.Security.Credentials.PasswordVault',
        `$v.Add((New-Object Windows.Security.Credentials.PasswordCredential(${psQuote(KEYCHAIN_SERVICE)}, ${psQuote(account)}, $pw)))`,
      ].join('; ');
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], password);
    } else {
      await run('secret-tool', ['store', `--label=${KEYCHAIN_SERVICE}`, 'service', 'tessera-backup', 'account', account], password);
    }
  } catch (e) {
    const missing = e instanceof Error && /ENOENT/.test(e.message);
    throw new UserError('keychain-save', missing ? (platform === 'linux' ? 'Saving to the keyring needs secret-tool (package libsecret-tools).' : 'The system password store isn’t available.') : `Couldn’t save to the password store: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Remove that item again (used by tests; the user can also remove it themselves). */
export async function removeFromKeychain(account: string): Promise<void> {
  await run('security', ['-i'], `delete-generic-password -a ${quote(account)} -s ${quote(KEYCHAIN_SERVICE)}\n`).catch(() => undefined);
}
