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
}

export interface Manifest {
  format: 1;
  libraryId: string;
  entries: ManifestEntry[];
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
}
