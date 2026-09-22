import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * Where to look for optional command-line tools on each platform, beyond PATH. Apps started from
 * the Dock or Start menu don't get the shell's PATH, so the usual install locations are checked too.
 */
function knownLocations(tool: string): string[] {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (process.platform === 'darwin') {
    return [`/opt/homebrew/bin/${tool}`, `/usr/local/bin/${tool}`, join(home, '.local', 'bin', tool)];
  }
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    const names: Record<string, string[]> = {
      kopia: [join(programFiles, 'Kopia', 'kopia.exe'), join(local, 'Programs', 'KopiaUI', 'resources', 'server', 'kopia.exe'), join(local, 'Microsoft', 'WinGet', 'Links', 'kopia.exe')],
      syncthing: [join(programFiles, 'Syncthing', 'syncthing.exe'), join(local, 'Programs', 'Syncthing', 'syncthing.exe'), join(local, 'Microsoft', 'WinGet', 'Links', 'syncthing.exe')],
    };
    return names[tool] ?? [];
  }
  return [`/usr/bin/${tool}`, `/usr/local/bin/${tool}`, `/snap/bin/${tool}`, join(home, '.local', 'bin', tool)];
}

/** The path of a tool, or null when it isn't installed. */
export function findTool(tool: string, extra: string[] = []): string | null {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
  const onPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((d) => join(d, exe));
  return [...extra, ...knownLocations(tool), ...onPath].find((p) => existsSync(p)) ?? null;
}
