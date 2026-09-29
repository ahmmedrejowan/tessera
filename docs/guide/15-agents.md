# AI agents

While Tessera is open it can answer an AI assistant running on the same computer, over the Model
Context Protocol (MCP). The assistant can search your library, file things, and copy assets into a
game, with the same rules you have.

Nothing outside your computer can reach it: it listens on `127.0.0.1` only, not on your network,
and not on the web.

## Turning it on

**Settings**, then **AI agents**, then **Answer AI agents**. The address appears beside it, with
the port (7458 by default) which you can change if something else on the computer wants it.

**How to connect** shows the exact configuration for the client you use, and a skill file that
teaches an assistant how this library works.

## The tools, and what is allowed

There are 63 tools in seven groups. Each group has a switch:

| Group | What it can do | At first |
|-------|----------------|----------|
| Looking | Search the library, read packs, files, collections and games, read the settings, and see how the library is backed up and synced. Changes nothing. | On |
| Filing | Star things, make and fill collections, record licenses and tags, archive a pack, read the library again. | On |
| Linking to a game | Copy assets into a game folder, with their licenses and credits, and recognize assets the game already has so they are not copied twice. | On |
| Bringing things in | Add packs from this computer and fetch links from the web, either copied in or indexed where they are. Never a move: an agent does not remove your originals. | On |
| Deleting to the bin | Move packs or files to the bin, and put them back. Nothing permanent. | On |
| The app itself | Open, make and close libraries, change Tessera's settings or this library's, run a backup, set syncing up and pair computers, draw or clear previews. | Off |
| Deleting for good | Empty the bin, throw away a pack waiting in Review. Cannot be undone. | Off |

Reading a setting is under Looking and needs no permission; changing one is under The app itself
and does.

The two that reach past the library, or cannot be undone, start switched off. Turn them on only
for as long as you need them.

## Setting syncing up with an agent

Syncing is the one job that has to be done twice, on two computers, in the right order, with the
same person sitting at both. That makes it the thing most worth handing to an agent. Settings →
Sync → Set up has the words to copy, and the app's own tools do the rest: `set_up_sync`,
`show_my_device_id`, `pair_computer`, `share_library_with` and `accept_shared_library`. They are
in The app itself, which is off until you turn it on, and everything an agent does appears in the
activity list like anything else.

## What it can be asked

Anything the window can do, in the assistant's own words. For example:

- "Find every CC0 footstep sound in my library."
- "What is in Food Kit, and under what license?"
- "File Forest Ambience under CC BY 4.0, from opengameart.org."
- "Gather the CC0 sounds into a collection called Menus."
- "Copy the Mini Arcade pack into Bunny Dash."
- "Which games already use Food Kit?"

## Watching it work

Every call is recorded with what it did and whether it was allowed, and the Agents screen shows the
list as it happens. A call from a group you have switched off is refused and shown as refused.
