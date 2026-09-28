/** Game projects Tessera copies assets into. */

export type Engine = 'unity' | 'godot' | 'unreal' | 'other';

export const ENGINE_LABELS: Record<Engine, string> = { unity: 'Unity', godot: 'Godot', unreal: 'Unreal Engine', other: 'Any folder' };

/** A linked project, as stored on this computer. */
export interface Project {
  id: string;
  name: string;
  /** The project's root folder. */
  path: string;
  engine: Engine;
  /** Engine version, when the project says (e.g. "6000.3.24f1", "4.4"). */
  engineVersion: string | null;
  /** Where copied assets go, relative to the project root, with forward slashes. */
  target: string;
  /** Where the credits file is written, relative to the project root; null to not write one. */
  creditsFile: string | null;
  addedAt: string;
}

/** A project as the window lists it, with what's been copied into it. */
export interface ProjectSummary extends Project {
  /** False when the folder can't be found (moved, or on a disconnected drive). */
  exists: boolean;
  assets: number;
  packs: number;
  lastCopy: string | null;
  /** Where its assets came from: each library and how many assets from it. */
  sources: { libraryId: string; libraryName: string; assets: number }[];
}

/** What the project's folder looks like, before linking it. */
export interface ProjectProbe {
  path: string;
  name: string;
  engine: Engine;
  engineVersion: string | null;
  target: string;
  /** Things worth knowing, e.g. "glTFast isn't installed, so models are copied as FBX." */
  notes: string[];
}

/** One asset copied into a project, as recorded in its manifest. */
export interface ManifestEntry {
  /** The library it came from (older entries: the manifest's). */
  libraryId?: string;
  /** That library's name when copied, to show when the library isn't known here. */
  libraryName?: string;
  packId: string;
  packName: string;
  /** The asset's ref in its pack (the file that stands for it). */
  ref: string;
  /** The file actually copied (a variant in the engine's preferred format). */
  copiedRef: string;
  /** Every file written for it, relative to the project root. */
  files: string[];
  licence: string | null;
  attribution: string | null;
  creator: string | null;
  sourceUrl: string | null;
  copiedAt: string;
  /**
   * The files were already in the game and Tessera only recognised them. It never wrote them, so
   * it must never delete them: taking this out of the game forgets the record and nothing else.
   */
  adopted?: boolean;
  /**
   * Files of this entry that already existed at that path, put there by somebody other than
   * Tessera, and were written over.
   *
   * The same rule as `adopted` applies to them, for the same reason: what Tessera did not create
   * it does not destroy. Taking the entry out leaves these files where they are. They are listed
   * rather than flagged because one entry can write several files and only some of them clash.
   */
  wereAlreadyThere?: string[];
}

export interface Manifest {
  format: 1;
  libraryId: string;
  entries: ManifestEntry[];
}

/** A game that uses assets from a pack: named when the pack is about to be deleted or archived. */
export interface ProjectUse {
  projectId: string;
  name: string;
  files: number;
}

/** Checked before copying: what will be written and anything worth a second look. */
export interface CopyPlan {
  assets: number;
  files: number;
  bytes: number;
  /** Licence problems, e.g. a non-commercial pack, or one with no licence recorded. */
  warnings: string[];
  /** Assets already in the project, which will be updated. */
  updating: number;
  /**
   * Files that are already at the paths this copy would write to, and that Tessera did not put
   * there. They are somebody else's work, and copying writes over them, so the person is told
   * before it happens rather than discovering it afterwards.
   */
  overwriting: string[];
}
