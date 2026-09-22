/** Checks on folder names and places, shared by the window (as you type) and the main process. */

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** Why a name can't be a folder name on every system, or null when it can. */
export function folderNameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Give it a name.';
  if (/[<>:"/\\|?*]/.test(n) || [...n].some((c) => c.charCodeAt(0) < 32)) return 'A folder name can’t contain < > : " / \\ | ? or *.';
  if (/[. ]$/.test(name)) return 'A folder name can’t end with a dot or a space.';
  if (RESERVED.test(n)) return `“${n}” is a name Windows keeps for itself.`;
  if (n.length > 120) return 'That name is too long for a folder.';
  return null;
}

/** The folder names in a path typed as "Assets/Game Library": a slash makes folders inside folders. */
export const pathParts = (path: string) => path.split(/[\\/]/).map((p) => p.trim());

/** Why a typed path (one or more folder names) can't be made on every system, or null when it can. */
export function folderPathProblem(path: string): string | null {
  const parts = pathParts(path);
  if (parts.length === 1) return folderNameProblem(path);
  if (parts.some((p) => !p)) return 'Put a folder name on each side of a slash.';
  for (const p of parts) {
    const problem = folderNameProblem(p);
    if (problem) return problem.replace('A folder name', `“${p}”:`).replace('Give it a name.', 'Put a folder name on each side of a slash.');
  }
  return null;
}

/** Services that sync a folder to the cloud, recognised from where it is. */
const CLOUD: [RegExp, string][] = [
  [/[\\/]Library[\\/]Mobile Documents[\\/]|[\\/]iCloud Drive([\\/]|$)/i, 'iCloud Drive'],
  [/[\\/]OneDrive( - [^\\/]+)?([\\/]|$)/i, 'OneDrive'],
  [/[\\/]Dropbox([\\/]|$)/i, 'Dropbox'],
  [/[\\/](Google ?Drive|My Drive)([\\/]|$)|[\\/]Library[\\/]CloudStorage[\\/]GoogleDrive/i, 'Google Drive'],
  [/[\\/]Library[\\/]CloudStorage[\\/]/i, 'a cloud storage service'],
];

/** The cloud service a folder is kept in step by, if any. */
export function cloudService(path: string): string | null {
  return CLOUD.find(([re]) => re.test(path))?.[1] ?? null;
}

export const joinPath = (dir: string, name: string, sep: string) => (dir.endsWith(sep) || dir.endsWith('/') ? dir + name : dir + sep + name);
export const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
