/** Reading the project's own CHANGELOG: one entry per version, newest first. */

export interface Release {
  /** "0.1.0" */
  version: string;
  /** What followed the version on its heading, a date, or "in development". */
  when: string;
  /** The lines under it, as written (list items keep their "- "). */
  lines: string[];
}

const HEADING = /^##\s+v?(\d+[\w.]*)\s*(?:[:–-]\s*(.*))?$/;

/** Every version in a changelog, in the order they appear (newest first by convention). */
export function parseChangelog(text: string): Release[] {
  const out: Release[] = [];
  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line.trim());
    if (heading) {
      out.push({ version: heading[1]!, when: (heading[2] ?? '').trim(), lines: [] });
      continue;
    }
    const current = out.at(-1);
    if (!current || !line.trim()) continue;
    // A wrapped list item is indented under its own dash: it belongs to the line above.
    const carriesOn = /^\s+\S/.test(line) && !/^\s*[-*]\s/.test(line) && current.lines.length > 0;
    if (carriesOn) current.lines[current.lines.length - 1] += ` ${line.trim()}`;
    else current.lines.push(line.trimEnd());
  }
  return out;
}

/** A changelog line as a person should read it: no asterisks, no leading dash. */
export function plainLine(line: string): { text: string; bullet: boolean } {
  const bullet = /^\s*[-*]\s+/.test(line);
  const text = line
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
  return { text, bullet };
}

/** The entry for one version, if the changelog has it. */
export const releaseFor = (releases: Release[], version: string): Release | undefined => releases.find((r) => r.version === version);
