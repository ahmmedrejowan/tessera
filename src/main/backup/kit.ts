import { BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { describeTarget, providerInfo, type StorageTarget } from '@shared/storage';
import { recoveryKitHtml } from './password';

/** What a recovery kit writes down about the storage: its settings, and its keys only if asked. */
export function kitDetails(target: StorageTarget, includeKeys: boolean): [string, string][] {
  const info = providerInfo(target.provider);
  const out: [string, string][] = [];
  for (const f of info.fields) {
    const v = target.values[f.key];
    if (!v || f.toggle || (f.secret && !includeKeys)) continue;
    out.push([f.label, v]);
  }
  if (info.signIn) out.push(['Sign-in', `Your ${info.label} account`]);
  if (!includeKeys && info.fields.some((f) => f.secret)) out.push(['Keys', 'Not written here: keep them with this page, or in your password manager.']);
  return out;
}

/** Render the kit to a PDF file. */
export async function writeRecoveryKit(path: string, input: { library: string; target: StorageTarget; password: string; includeKeys: boolean }): Promise<void> {
  const html = recoveryKitHtml({
    library: input.library,
    where: describeTarget(input.target),
    details: kitDetails(input.target, input.includeKeys),
    password: input.password,
    date: new Date().toLocaleDateString([], { dateStyle: 'long' }),
  });
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    await writeFile(path, pdf, { mode: 0o600 });
  } finally {
    win.destroy();
  }
}
