/**
 * A real library, running the app's own services, for tests that want to see what a change does
 * rather than what a function returns. Everything is in a temporary folder and goes with it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterEach } from 'vitest';
import { join } from 'node:path';
import type { ToolContext } from '../src/main/mcp/tools';
import { Jobs } from '../src/main/jobs';
import { LibraryService } from '../src/main/libraryService';
import { ProjectService } from '../src/main/projects/service';
import { tempDir } from './helpers';

export interface Running {
  /** The library's folder. */
  root: string;
  /** Where the app keeps its own data for this test. */
  dataDir: string;
  library: LibraryService;
  projects: ProjectService;
  jobs: Jobs;
  /** Every index change the window would have been told about. */
  changes: () => number;
  /** What an agent would be given, ready to call a tool with. */
  context: () => ToolContext;
  /** What was written into the library's activity, newest last. */
  notes: string[];
}

/** A real one-pixel PNG, for tests that need a file the app will treat as a picture. */
export const PIXEL = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
);

/** A pack made on disk, with files in it, before the library is read. */
export interface PackFixture {
  name: string;
  /** Path inside the pack to its contents, without the leading original/. */
  files: Record<string, string | Buffer>;
  licence?: string | null;
  source?: string | null;
}

/** Every library a test opened, so each one is closed before the next test starts. */
const opened: LibraryService[] = [];
afterEach(() => {
  for (const lib of opened.splice(0)) lib.close();
});

/**
 * Open a library with these packs in it. The packs are written as folders, the way an import
 * leaves them, then read by the app itself, so the index is built the same way it is in the app.
 */
export async function running(packs: PackFixture[] = []): Promise<Running> {
  const root = join(tempDir(), 'Library');
  const dataDir = tempDir();
  const jobs = new Jobs(() => undefined);
  let changed = 0;
  const library = new LibraryService({
    dataDir,
    jobs,
    onState: () => undefined,
    onIndexChanged: () => {
      changed += 1;
    },
    siteRules: () => [],
    binKeepDays: () => 30,
    // No watching in tests: the folders go the moment a test ends, and a watcher pointed at a
    // folder that has gone is a crash on Windows.
    watchFiles: false,
  });
  await library.create(root, 'Test library');
  opened.push(library);
  const notes: string[] = [];
  const projects = new ProjectService(dataDir, jobs);

  for (const pack of packs) {
    const dir = join(root, 'packs', pack.name);
    for (const [path, body] of Object.entries(pack.files)) {
      const file = join(dir, 'original', ...path.split('/'));
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, body);
    }
    mkdirSync(join(dir, 'licence'), { recursive: true });
    writeFileSync(
      join(dir, 'pack.json'),
      JSON.stringify({
        format: 1,
        id: `id-${pack.name.toLowerCase().replace(/\W+/g, '-')}`,
        name: pack.name,
        // A pack without both a licence and a source waits in Review, as it would in the app.
        status: pack.licence === null || pack.source === null ? 'inbox' : 'library',
        licence: { id: pack.licence === undefined ? 'CC0-1.0' : pack.licence, attribution: null, proof: [], notes: '' },
        source: { site: null, name: pack.source === undefined ? 'Test' : pack.source, url: null, creator: null, creatorUrl: null },
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
  }
  // Opening a library starts a sync of its own; the second call waits for that one to finish too.
  await library.sync();
  await library.sync();

  const context = (): ToolContext => ({
    library,
    projects,
    // Enough of the download queue for the tools that drive it; nothing here touches the network.
    downloads: {
      add: () => ({ added: 0, skipped: 0 }),
      list: () => [],
      pause: () => undefined,
      resume: () => undefined,
      again: () => undefined,
      cancel: () => undefined,
      remove: () => undefined,
      pauseAll: () => undefined,
      resumeAll: () => undefined,
      retryFailed: () => undefined,
      clear: async () => undefined,
      done: () => undefined,
      fileOf: () => null,
      urlOf: () => null,
    } as unknown as ToolContext['downloads'],
    copySource: () => {
      const { queries, index } = library.require();
      return {
        libraryId: 'test-library',
        libraryName: 'Test library',
        packDir: (id: string) => join(root, 'packs', index.known(id)?.folder ?? ''),
        pack: (id: string) => {
          const row = queries.pack(id);
          return row ? { meta: row.meta, folder: row.folder } : null;
        },
        variants: (packId: string, ref: string) => queries.variantsOf(packId, ref),
        packRefs: (packId: string) => queries.packRefs(packId),
      };
    },
    libraryId: () => 'test-library',
    note: (text: string) => void notes.push(text),
    settings: () => ({ mcp: { enabled: true, port: 7458, off: [], groupsOff: [], groupsOn: ['system', 'danger'] } }) as unknown as ReturnType<ToolContext['settings']>,
    app: {
      libraries: async () => [],
      openLibrary: (path: string) => library.open(path),
      createLibrary: (path: string, name: string) => library.create(path, name),
      closeLibrary: async () => library.close(),
      updateSettings: async (patch) => patch as never,
      activity: async () => [],
      backUpNow: async () => undefined,
      reindex: () => library.reindex(),
    },
  });

  return { root, dataDir, library, projects, jobs, changes: () => changed, context, notes };
}

/** Call a tool the way the server would: parse the arguments, run it, give back what it said. */
export async function callTool(app: Running, name: string, args: unknown = {}): Promise<unknown> {
  const { TOOL_BY_NAME } = await import('../src/main/mcp/tools');
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new Error(`no tool called ${name}`);
  return tool.run(tool.input.parse(args) as never, app.context());
}
