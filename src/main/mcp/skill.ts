import { TOOL_GROUPS } from '@shared/mcp';
import { ANSWERS } from './examples';
import { TOOLS } from './tools';

/**
 * The skill an agent is given: what this place is, the words it uses, and the rules that make an
 * agent good at working in it. Written from the same tool list the server offers, so it cannot
 * describe a tool that isn't there.
 */
export function skillMarkdown(url: string): string {
  const groups = TOOL_GROUPS.map((g) => {
    const tools = TOOLS.filter((t) => t.group === g.id);
    return [
      `### ${g.title}`,
      '',
      g.note,
      '',
      // What a tool gives back matters as much as what it takes, and the app already has that
      // written down for its own list. An agent that knows the shape of the answer asks for the
      // right thing first time instead of calling something to find out what it returns.
      ...tools.map((t) => `- \`${t.name}\` — ${t.summary}${ANSWERS[t.name] ? ` _Gives back: ${ANSWERS[t.name]!.returns}_` : ''}`),
      '',
    ].join('\n');
  }).join('\n');

  return `---
name: tessera-library
description: Work with a Tessera asset library: find game assets, keep their licenses straight, gather them into collections and link them into a game. Use when the person mentions their asset library, packs, or needs assets for a game.
---

# Working in a Tessera library

Tessera is a desktop app that holds a person's game assets and, above all, the record of what
they are allowed to do with them. It answers on \`${url}\` while it is open. Everything you change
appears in their window as you do it, so work as though they are watching, because they are.

## The words

- **Pack** — how assets arrive: a download, a bundle, a folder. A pack carries the license, the
  source and the proof. It is the unit that can be archived or deleted.
- **Asset** — one file inside a pack. It can be starred, collected, linked and deleted on its own.
- **Collection** — a gathering of packs and assets for one game or one job. It can carry rules
  ("only CC0") and refuse anything that doesn't fit.
- **Linking** — copying an asset into a game's folder, in the format that engine prefers, with its
  textures, its license papers and the game's credits file kept up to date.
- **Review** — where a pack waits until it has both a license and a source. It cannot be browsed
  until it does.
- **Game** — a project folder the library copies into. The tools call it \`projectId\`, the window
  and the person call it a game. They are the same thing.
- **Archive** — a pack kept in full but out of the way of browsing.
- **The bin** — where deleting puts things. You can delete to the bin and put things back.
  Emptying it destroys what is in it, and is the one thing here that nobody can undo.

## The rules that matter

1. **Never guess a license.** If a pack has none recorded, say so and ask, or record what the
   pack's own files say. A wrong license is worse than a missing one.
2. **A pack leaves Review only when it has a license and a source.** Use \`set_pack_details\`, then
   \`move_to_library\`.
3. **Check \`usage\` before archiving or deleting.** Files already linked into a game stay there,
   with their license beside them, but the person should know.
4. **Deleting means the bin, and the bin can be emptied.** \`delete_to_bin\` can be undone with
   \`restore_from_bin\`. \`empty_bin\` cannot be undone by anyone, and it is offered to you only
   when the person has switched on "Deleting for good". Never call it to tidy up; call it only
   when the person has asked for that, in those words.
5. **When unsure, archive rather than delete.** \`archive_pack\` keeps the pack whole and only
   takes it out of browsing, and is the right answer to "get rid of things I don't use". Tessera
   has no record of what is unused, so any such list is your guess: say that it is a guess, show
   it, and wait to be told to go ahead.
6. **Say the whole list before acting on many things.** A tool that takes an array will happily
   take fifty. Name them, or count them and say what they have in common, before you call it.
7. **Prefer \`search\` with filters over reading everything.** The library can hold a hundred
   thousand files. Filter values are ids, not names: the license is \`CC0-1.0\`, not \`CC0\`. Use
   \`list_facets\` to see the values that exist, and if a search comes back empty it will tell you
   which of your filter values matched nothing.
8. **Linking tells you what is wrong with the licenses.** \`link_to_game\` returns
   \`licenseWarnings\` when a pack has no license recorded, forbids commercial use, needs a credit
   line, or is still in Review. It copies anyway. Read them out; the person may want it undone.
9. **A name the game already uses is the person's call.** \`link_to_game\` compares contents with
   SHA-256 first: a file already there with exactly the library's bytes is left alone and counted
   in \`alreadyThereUnchanged\`. A different file under the same name comes back in
   \`nameTakenByADifferentFile\`, and \`ifNameTaken\` decides what happened to it: \`skip\` (the
   default, the game keeps its own), \`overwrite\`, or \`rename\`. Do not pass \`overwrite\` without
   being asked for it.
10. **Say what you did in the app's words**: starred, collected, linked, archived, in the bin.

## A good first move

Call \`library_status\`. It says which library is open, how much is in it, and what needs
attention. If nothing is open, ask the person to open one in Tessera.

## The tools

${groups}
## Connecting

The app is already listening; there is nothing to install and no key to paste. Most agents take a
block like this wherever they keep their MCP settings:

\`\`\`json
{ "mcpServers": { "tessera": { "type": "http", "url": "${url}" } } }
\`\`\`

Claude Code can do it in one line:

\`\`\`bash
claude mcp add --transport http tessera ${url}
\`\`\`

An agent that can only start a program and talk to it, rather than speak HTTP, needs a bridge:
run \`npx mcp-remote ${url}\` as its command.
`;
}
