/**
 * The help centre's own words: topics, and the questions under each. Kept as plain data so the
 * search box, the topic pages and anything else read the same thing.
 */

export interface HelpQuestion {
  id: string;
  q: string;
  /** Paragraphs, in the user's language: what it does, and what to do. */
  a: string[];
}

export interface HelpTopic {
  id: string;
  title: string;
  /** One line under the title. */
  summary: string;
  /** A Material icon name the window maps to a component. */
  icon: 'start' | 'licence' | 'add' | 'download' | 'organise' | 'project' | 'agents' | 'safety' | 'trouble';
  questions: HelpQuestion[];
}

export const HELP: HelpTopic[] = [
  {
    id: 'start',
    title: 'Getting started',
    summary: 'What Tessera is for, and the first few minutes with it',
    icon: 'start',
    questions: [
      {
        id: 'what-is-tessera',
        q: 'What is Tessera for?',
        a: [
          'Tessera is a library for the game assets you collect: models, textures, sprites, UI, audio, music, fonts and HDRIs. It keeps your copy of every pack whole, with its licence and where it came from on record, so you can find a piece in seconds and drop it into a game with its credits written for you.',
          'It is a desktop app that works on your own files. Nothing is uploaded, and your library is ordinary folders you can open in Finder or Explorer at any time.',
        ],
      },
      {
        id: 'what-is-a-pack',
        q: 'What is a pack?',
        a: [
          'One download: a zip, a folder, or a few files you got together. Tessera copies it in as it is (archives stay archives) and reads inside to list what it holds.',
          'A pack carries its own record: name, licence, where it came from, creator, version, style, tags, and any licence files it shipped with.',
        ],
      },
      {
        id: 'first-steps',
        q: 'I have just made a library. What now?',
        a: [
          'Add a pack or two: drag them onto the window, choose files from the + button, or paste a link into Downloads. Home offers three CC0 sample packs if you would rather look around first.',
          'Then set up backups (Settings → Backups). A library is your own work; one copy is no copy.',
        ],
      },
      {
        id: 'many-libraries',
        q: 'Can I have more than one library?',
        a: [
          'Yes. Each has its own folder, its own backups, sync and rules. The switcher at the top right moves between them, and each remembers where it was.',
          'Projects, the sites you have settled and the download settings are Tessera’s, shared by every library on this computer.',
        ],
      },
    ],
  },
  {
    id: 'licence',
    title: 'Licences and credits',
    summary: 'Why Tessera asks, what it records, and what it can prove later',
    icon: 'licence',
    questions: [
      {
        id: 'why-licence',
        q: 'Why does every pack need a licence and a link?',
        a: [
          'Because a year from now, when your game ships, you need to know what you were allowed to do with each asset, and be able to show it. A pack without both waits in Review rather than joining the library.',
          'It is the one rule Tessera insists on. Everything else can be filled in later.',
        ],
      },
      {
        id: 'credit-line',
        q: 'What is a credit line?',
        a: [
          'Some licences ask you to name the author. The credit line is the wording to use, such as “Kenney (kenney.nl), CC0”, and Tessera copies it into a project’s CREDITS.md whenever an asset from that pack is used.',
          'Help shows how many packs still need one, and the pack page is where you fill it in.',
        ],
      },
      {
        id: 'restricted',
        q: 'What counts as restricted terms?',
        a: [
          'Licences that rule out selling the result (non-commercial), or ones Tessera cannot judge: custom wording, “personal use only”, or nothing at all.',
          'Such packs are kept and shown, but marked, so you can decide before they reach a game you sell.',
        ],
      },
      {
        id: 'proof',
        q: 'What proof does Tessera keep?',
        a: [
          'The licence files the pack shipped with, and, when a pack has a page link, a PDF snapshot of that page as it was when you downloaded it, plus a copy on archive.org if you leave that switch on.',
          'Both sit in the pack’s own folder, so they travel with it.',
        ],
      },
      {
        id: 'site-rules',
        q: 'Can I tell Tessera a whole site is CC0?',
        a: [
          'Yes. When you fill in a pack’s licence and its link, Tessera offers to remember the site; after that its packs fill themselves in. Settings → Sites lists them.',
          'What a pack’s own files say always wins over a rule.',
        ],
      },
    ],
  },
  {
    id: 'add',
    title: 'Adding packs and Review',
    summary: 'Getting packs in, and what waits in Review',
    icon: 'add',
    questions: [
      {
        id: 'ways-to-add',
        q: 'What are the ways to add a pack?',
        a: [
          'Drag files or folders onto the window; the + button to choose files or a folder; or Downloads, for links. A folder of downloads is offered as several packs, or as one, whichever it looks like.',
          'Whatever you add is copied into the library. Your original download is left exactly where it was.',
        ],
      },
      {
        id: 'add-page',
        q: 'What is the page that opens when I add something?',
        a: [
          'The add page: everything Tessera could work out is already filled in (name, licence, source, creator, description, style and tags), with a note under each saying where it came from.',
          'Add to library when it is right; Finish later to park it in Review; Cancel to drop the copy altogether.',
        ],
      },
      {
        id: 'review',
        q: 'What does Review do?',
        a: [
          'It holds packs whose licence or source is not clear. Each row takes a licence and a link in place, and moves into the library by itself once it has both.',
          'Nothing in Review shows up in Browse, so an unchecked pack cannot slip into a game.',
        ],
      },
      {
        id: 'batches',
        q: 'I added twenty packs at once. Do I have to fill them all in?',
        a: [
          'No. A batch shows one list, sorted into ones that need details and ones that are ready. Pick several and fill a field once for all of them, then add the ready ones and leave the rest for Review.',
        ],
      },
    ],
  },
  {
    id: 'download',
    title: 'Downloads',
    summary: 'Bringing links, and what happens when they arrive',
    icon: 'download',
    questions: [
      {
        id: 'what-can-fetch',
        q: 'What can Tessera fetch?',
        a: [
          'Links you bring. Asset pages from Kenney, Poly Haven, ambientCG, OpenGameArt, GitHub releases, Google Drive and Dropbox lead to the file behind them; other links should point straight at a file.',
          'A link that answers with a web page is refused with a word about opening it in your browser. Pages behind a sign-in or a purchase are not fetched at all.',
        ],
      },
      {
        id: 'paste-many',
        q: 'Can I paste a list?',
        a: [
          'Yes, one link per line, or drop a text, CSV or JSON file, a bookmarks export, or a .url shortcut on the page. Tessera takes the web links out of whatever you give it.',
          'The sites are named before anything is fetched.',
        ],
      },
      {
        id: 'after-download',
        q: 'What happens when a download finishes?',
        a: [
          'Settings → Downloads decides: add them (a clear licence goes into the library, anything unclear waits in Review), send every one to Review, or leave them in Downloads with an Add button.',
          'Either way the link is recorded as the pack’s source, and the page snapshot and archive.org copy are made.',
        ],
      },
      {
        id: 'pause-resume',
        q: 'Can I pause, or carry on after closing Tessera?',
        a: [
          'Yes. Each download can be paused and carried on, and the list survives a restart: anything that was running comes back paused. A dropped connection is tried again by itself three times.',
        ],
      },
      {
        id: 'downloaded-files',
        q: 'Where do downloaded files go?',
        a: [
          'Into Tessera’s own folder until you clear them; the library keeps its own copy of anything added. “Clear finished” removes the rows and their files, and the page shows how much they take up.',
        ],
      },
    ],
  },
  {
    id: 'organise',
    title: 'Finding and organising',
    summary: 'Search, filters, collections and tags',
    icon: 'organise',
    questions: [
      {
        id: 'search',
        q: 'How does search work?',
        a: [
          'The box at the top searches packs, assets and tags at once, and takes you to Browse. Filters down the left narrow by type, format, source, creator, licence, genre, style and tags.',
          'Browse shows assets or packs (the tabs sit in the title row) and remembers how you left it.',
        ],
      },
      {
        id: 'collections',
        q: 'What is a collection?',
        a: [
          'A gathering of assets from any pack, for one game or one job. Pick assets in Browse and add them.',
          'A smart collection is a saved search instead: it fills itself in as your library grows.',
        ],
      },
      {
        id: 'formats',
        q: 'One model came in four formats. Will I see it four times?',
        a: [
          'No. Formats of the same asset are grouped, and the viewer shows the one it can draw. Supporting files (textures of a model, material files, pack previews) are kept out of the way unless you ask for them in the view options.',
        ],
      },
    ],
  },
  {
    id: 'project',
    title: 'Game projects',
    summary: 'Copying assets into Unity, Godot, Unreal or any folder',
    icon: 'project',
    questions: [
      {
        id: 'link-project',
        q: 'How do I link a project?',
        a: [
          'Projects → Link a project, then choose the project folder. Tessera works out the engine and where assets belong; any folder will do if it is not one of those engines.',
        ],
      },
      {
        id: 'copy',
        q: 'What happens when I copy an asset to a project?',
        a: [
          'The asset arrives in the project’s assets folder with the files it needs (a model brings its textures), plus a licence file for the pack it came from, and a CREDITS.md that is kept up to date.',
          'The project page lists everything copied, and which library each came from.',
        ],
      },
    ],
  },
  {
    id: 'safety',
    title: 'Backups, sync and privacy',
    summary: 'Keeping the library safe, and what leaves this computer',
    icon: 'safety',
    questions: [
      {
        id: 'backups',
        q: 'How do backups work?',
        a: [
          'Kopia makes encrypted copies of a library somewhere else (a drive, a cloud drive, cloud storage or a server) and sends only what changed.',
          'Each library is backed up on its own, and the password is yours: without it nothing can be read, and nobody can give it back to you.',
        ],
      },
      {
        id: 'restore',
        q: 'How do I get a library back?',
        a: [
          'Settings → Backups → Restore, or the welcome screen if you have no library open. Pick the store, the library and the snapshot; a restore never writes over what is already there; it makes a copy beside it.',
        ],
      },
      {
        id: 'sync',
        q: 'Can I use one library on two computers?',
        a: [
          'Yes, with Sync: Syncthing keeps the folder the same on computers you have paired, over your own network. Nothing goes through anyone else’s server.',
          'A library can go on syncing while another one is open, if you let it.',
        ],
      },
      {
        id: 'privacy',
        q: 'What does Tessera send anywhere?',
        a: [
          'Nothing, unless you ask. Downloads go to the sites whose links you bring. Page snapshots are made on this computer; an archive.org copy is asked for only while that switch is on. The update check reads a list of releases and sends nothing about you. Error reports are never sent without your say-so, and you see exactly what they contain first.',
        ],
      },
    ],
  },
  {
    id: 'agents',
    title: 'AI agents',
    summary: 'Letting an agent work in the library, and choosing what it may do',
    icon: 'agents',
    questions: [
      {
        id: 'agents-what',
        q: 'What does "answer AI agents" mean?',
        a: [
          'While Tessera is open it listens on your own computer for AI agents, at an address like http://127.0.0.1:7458/mcp. An agent that connects can do the things this window does: search the library, read a pack, record a licence, gather a collection, link assets into a game, bring new packs in, move something to the bin.',
          'It is bound to this computer, so nothing on your network or on the internet can reach it. There is no password, because there is no way in from outside.',
        ],
      },
      {
        id: 'agents-connect',
        q: 'How do I connect one?',
        a: [
          'Home → AI agents → How to connect has the address, the command for Claude Code, and the JSON that config-file agents take. The same page is in Settings → AI agents.',
          'That page also carries a skill file: a short explanation of the words Tessera uses and the rules that matter. Install it for Claude in one press, save it anywhere, or copy it into a project. An agent that has read it knows not to guess a licence.',
        ],
      },
      {
        id: 'agents-tools',
        q: 'How do I decide what an agent may do?',
        a: [
          'Agent tools lists everything an agent can call, grouped by what it does: looking, filing, linking to a game, bringing things in, and deleting to the bin. Each group has a switch, and so does each tool inside it.',
          'A tool that is switched off is not offered, and a call to it is refused with a line saying it is off in Tessera. Changes take effect at once, mid-conversation.',
        ],
      },
      {
        id: 'agents-safe',
        q: 'Can an agent delete my files?',
        a: [
          'Only to the library’s bin, which keeps everything and puts it back where it came from. Emptying the bin is yours alone: no tool does it, however the request is worded.',
          'Everything an agent does is written into Activity with the tool it used, and the window updates as it happens, so you can watch it work and undo what you would rather it had not.',
        ],
      },
    ],
  },
  {
    id: 'trouble',
    title: 'When something goes wrong',
    summary: 'Files moved, a pack looks wrong, or Tessera misbehaves',
    icon: 'trouble',
    questions: [
      {
        id: 'moved-files',
        q: 'I moved or edited files by hand. What now?',
        a: [
          'Tessera watches the library folder and notices most changes on its own. If something looks stale, Settings → Previews and index → Read the library again reads every pack from scratch.',
        ],
      },
      {
        id: 'missing-previews',
        q: 'A pack shows no pictures.',
        a: [
          'Previews are drawn in the background and cached; a big pack takes a while. Settings → Previews and index shows how far it has got and can start again.',
          'Some files have nothing to draw: a .blend, say. Their entries still search and copy correctly.',
        ],
      },
      {
        id: 'report',
        q: 'Something went wrong. How do I report it?',
        a: [
          'Help → Report a problem. It gathers what happened, this session’s errors and the recent log, shows you the lot, and sends nothing until you say so.',
          'Names of files, packs and folders are taken out first.',
        ],
      },
    ],
  },
];

/** Every question, with the topic it belongs to, for the search box. */
export const ALL_QUESTIONS = HELP.flatMap((topic) => topic.questions.map((question) => ({ topic, question })));

/** Questions matching what was typed: words in the question, its answer, or its topic. */
export function searchHelp(text: string): { topic: HelpTopic; question: HelpQuestion }[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return ALL_QUESTIONS.filter(({ topic, question }) => {
    const hay = `${topic.title} ${topic.summary} ${question.q} ${question.a.join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }).slice(0, 12);
}

export const topicById = (id: string): HelpTopic | undefined => HELP.find((t) => t.id === id);
