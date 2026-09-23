import { TOOL_GROUPS } from '@shared/mcp';
import { TOOLS } from './tools';

/**
 * The skill an agent is given: what this place is, the words it uses, and the rules that make an
 * agent good at working in it. Written from the same tool list the server offers, so it cannot
 * describe a tool that isn't there.
 */
export function skillMarkdown(url: string): string {
  const groups = TOOL_GROUPS.map((g) => {
    const tools = TOOLS.filter((t) => t.group === g.id);
    return [`### ${g.title}`, '', g.note, '', ...tools.map((t) => `- \`${t.name}\` — ${t.summary}`), ''].join('\n');
  }).join('\n');

  return `---
name: tessera-library
description: Work with a Tessera asset library: find game assets, keep their licences straight, gather them into collections and link them into a game. Use when the person mentions their asset library, packs, or needs assets for a game.
---

# Working in a Tessera library

Tessera is a desktop app that holds a person's game assets and, above all, the record of what
they are allowed to do with them. It answers on \`${url}\` while it is open. Everything you change
appears in their window as you do it, so work as though they are watching, because they are.

## The words

- **Pack** — how assets arrive: a download, a bundle, a folder. A pack carries the licence, the
  source and the proof. It is the unit that can be archived or deleted.
- **Asset** — one file inside a pack. It can be starred, collected, linked and deleted on its own.
- **Collection** — a gathering of packs and assets for one game or one job. It can carry rules
  ("only CC0") and refuse anything that doesn't fit.
- **Linking** — copying an asset into a game's folder, in the format that engine prefers, with its
  textures, its licence papers and the game's credits file kept up to date.
- **Review** — where a pack waits until it has both a licence and a source. It cannot be browsed
  until it does.
- **Archive** — a pack kept in full but out of the way of browsing.
- **The bin** — where deleting puts things. You can delete to the bin and put things back. Only
  the person can empty it.

## The rules that matter

1. **Never guess a licence.** If a pack has none recorded, say so and ask, or record what the
   pack's own files say. A wrong licence is worse than a missing one.
2. **A pack leaves Review only when it has a licence and a source.** Use \`set_pack_details\`, then
   \`move_to_library\`.
3. **Check \`usage\` before archiving or deleting.** Files already linked into a game stay there,
   with their licence beside them, but the person should know.
4. **Deleting means the bin.** Say so plainly when you do it; it is not permanent and you cannot
   make it permanent.
5. **Prefer \`search\` with filters over reading everything.** The library can hold a hundred
   thousand files.
6. **Say what you did in the app's words**: starred, collected, linked, archived, in the bin.

## A good first move

Call \`library_status\`. It says which library is open, how much is in it, and what needs
attention. If nothing is open, ask the person to open one in Tessera.

## The tools

${groups}
## Connecting

The app is already listening; there is nothing to install and no key to paste.

\`\`\`bash
claude mcp add --transport http tessera ${url}
\`\`\`

For a client that reads a config file:

\`\`\`json
{ "mcpServers": { "tessera": { "type": "http", "url": "${url}" } } }
\`\`\`
`;
}
