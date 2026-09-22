import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { CopyPlan, ManifestEntry, Project, ProjectProbe, ProjectSummary } from '@shared/project';
import { UserError } from '../errors';
import { readJson, writeJson } from '../fsx';
import type { Jobs } from '../jobs';
import { MANIFEST, planCopy, readManifest, removeFromProject, runCopy, type CopySource } from './copy';
import { writeCredits } from './credits';
import { probeProject } from './engines';

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  path: z.string().min(1),
  engine: z.enum(['unity', 'godot', 'unreal', 'other']),
  engineVersion: z.string().nullable().catch(null),
  target: z.string().min(1),
  creditsFile: z.string().nullable().catch('CREDITS.md'),
  addedAt: z.string(),
});
const StoreSchema = z.object({ projects: z.array(ProjectSchema).catch([]) });

/** Folder paths inside a project must stay inside it. */
function checkRelative(p: string, what: string): string {
  const clean = p.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!clean || clean.split('/').includes('..')) throw new UserError('bad-path', `The ${what} must be a folder inside the project.`);
  return clean;
}

/**
 * Linked game projects, kept in the app's data folder (their paths belong to this computer), and
 * copying assets into them.
 */
export class ProjectService {
  private readonly file: string;

  constructor(
    dataDir: string,
    private readonly jobs: Jobs,
  ) {
    this.file = join(dataDir, 'projects.json');
  }

  private async load(): Promise<Project[]> {
    return StoreSchema.parse((await readJson(this.file).catch(() => null)) ?? {}).projects;
  }

  private async save(projects: Project[]): Promise<void> {
    await writeJson(this.file, { projects });
  }

  async get(id: string): Promise<Project> {
    const p = (await this.load()).find((x) => x.id === id);
    if (!p) throw new UserError('no-project', 'That project isn’t linked any more.');
    if (!existsSync(p.path)) throw new UserError('project-missing', `The project folder ${p.path} can’t be found. Was it moved?`);
    return p;
  }

  async list(libraryId: string): Promise<ProjectSummary[]> {
    const out: ProjectSummary[] = [];
    for (const p of await this.load()) {
      const exists = existsSync(p.path);
      const m = exists ? await readManifest(p.path, libraryId) : null;
      const entries = m?.entries ?? [];
      out.push({
        ...p,
        exists,
        assets: entries.length,
        packs: new Set(entries.map((e) => e.packId)).size,
        lastCopy: entries.map((e) => e.copiedAt).sort().at(-1) ?? null,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  probe(path: string): Promise<ProjectProbe> {
    return probeProject(path).then(({ gltf: _gltf, ...probe }) => probe);
  }

  async add(probe: ProjectProbe): Promise<Project> {
    const projects = await this.load();
    const existing = projects.find((p) => p.path === probe.path);
    if (existing) return existing;
    const project: Project = {
      id: randomUUID(),
      name: probe.name.trim() || 'Project',
      path: probe.path,
      engine: probe.engine,
      engineVersion: probe.engineVersion,
      target: checkRelative(probe.target, 'destination folder'),
      creditsFile: 'CREDITS.md',
      addedAt: new Date().toISOString(),
    };
    await this.save([...projects, project]);
    return project;
  }

  async update(id: string, patch: Partial<Pick<Project, 'name' | 'target' | 'creditsFile'>>): Promise<void> {
    const projects = await this.load();
    const i = projects.findIndex((p) => p.id === id);
    if (i < 0) throw new UserError('no-project', 'That project isn’t linked any more.');
    const next = { ...projects[i]!, ...patch };
    if (patch.target !== undefined) next.target = checkRelative(patch.target, 'destination folder');
    if (patch.creditsFile) next.creditsFile = checkRelative(patch.creditsFile, 'credits file');
    projects[i] = next;
    await this.save(projects);
  }

  /** Forget a project. Its files, and what was copied into it, stay where they are. */
  async unlink(id: string): Promise<void> {
    await this.save((await this.load()).filter((p) => p.id !== id));
  }

  async entries(id: string, libraryId: string): Promise<ManifestEntry[]> {
    return (await readManifest((await this.get(id)).path, libraryId)).entries;
  }

  async plan(id: string, items: { packId: string; ref: string }[], src: CopySource): Promise<CopyPlan> {
    const project = await this.get(id);
    const { gltf } = await probeProject(project.path);
    return (await planCopy(project, items, src, gltf)).plan;
  }

  async copy(id: string, items: { packId: string; ref: string }[], src: CopySource): Promise<number> {
    const project = await this.get(id);
    const { gltf } = await probeProject(project.path);
    return this.jobs.run(`Copying to ${project.name}`, async (job) => {
      const { jobs } = await planCopy(project, items, src, gltf);
      const written = await runCopy(project, jobs, src, (done, total) => job.update(done / total, `${done} of ${total} files`));
      return written.length;
    });
  }

  async remove(id: string, items: { packId: string; ref: string }[], libraryId: string): Promise<number> {
    return removeFromProject(await this.get(id), libraryId, items);
  }

  /**
   * A pack's licence, credit line or name changed: update what every project that uses it has on
   * record, and rewrite their credits files.
   */
  async packChanged(libraryId: string, packId: string, info: Pick<ManifestEntry, 'packName' | 'licence' | 'attribution' | 'creator' | 'sourceUrl'>): Promise<void> {
    for (const project of await this.load()) {
      if (!existsSync(project.path)) continue;
      const manifest = await readManifest(project.path, libraryId);
      if (!manifest.entries.some((e) => e.packId === packId)) continue;
      manifest.entries = manifest.entries.map((e) => (e.packId === packId ? { ...e, ...info } : e));
      await writeJson(join(project.path, MANIFEST), manifest);
      if (project.creditsFile) await writeCredits(join(project.path, ...project.creditsFile.split('/')), manifest.entries);
    }
  }

  /** Write the credits file again (after a pack's licence or credit line changed). */
  async refreshCredits(id: string, libraryId: string): Promise<string | null> {
    const project = await this.get(id);
    if (!project.creditsFile) return null;
    const path = join(project.path, ...project.creditsFile.split('/'));
    await writeCredits(path, (await readManifest(project.path, libraryId)).entries);
    return path;
  }
}
