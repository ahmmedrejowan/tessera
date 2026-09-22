import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Engine, ProjectProbe } from '@shared/project';

/** Default place for copied assets in each engine's project. */
export const DEFAULT_TARGET: Record<Engine, string> = {
  unity: 'Assets/ThirdParty',
  godot: 'assets/third_party',
  unreal: 'Content/ThirdParty',
  other: 'assets',
};

/** Which model format each engine takes best, most preferred first. */
export function modelPreference(engine: Engine, gltfSupport: boolean): string[] {
  switch (engine) {
    case 'unity':
      return gltfSupport ? ['glb', 'gltf', 'fbx', 'obj', 'dae'] : ['fbx', 'obj', 'dae', 'glb', 'gltf'];
    case 'godot':
      return ['glb', 'gltf', 'fbx', 'obj', 'dae'];
    case 'unreal':
      return ['fbx', 'glb', 'gltf', 'obj'];
    default:
      return ['glb', 'gltf', 'fbx', 'obj', 'dae'];
  }
}

/** Images each engine handles natively; others fall back to a PNG variant when there is one. */
export const imagePreference = (engine: Engine) => (engine === 'godot' ? ['png', 'svg', 'webp', 'jpg', 'jpeg'] : ['png', 'jpg', 'jpeg', 'tga', 'psd', 'svg']);

/** Does this Unity project have a glTF importer (glTFast or UnityGLTF)? */
async function unityHasGltf(root: string): Promise<boolean> {
  try {
    const manifest = await readFile(join(root, 'Packages', 'manifest.json'), 'utf8');
    return /com\.unity\.cloud\.gltfast|com\.atteneder\.gltfast|org\.khronos\.unitygltf/.test(manifest);
  } catch {
    return false;
  }
}

/** Look at a folder and say what kind of game project it is. */
export async function probeProject(path: string): Promise<ProjectProbe & { gltf: boolean }> {
  const notes: string[] = [];
  const version = join(path, 'ProjectSettings', 'ProjectVersion.txt');
  if (existsSync(version)) {
    const text = await readFile(version, 'utf8').catch(() => '');
    const gltf = await unityHasGltf(path);
    if (!gltf) notes.push('This project has no glTF importer, so models are copied as FBX where a pack has them.');
    return { path, name: basename(path), engine: 'unity', engineVersion: /m_EditorVersion:\s*(\S+)/.exec(text)?.[1] ?? null, target: DEFAULT_TARGET.unity, notes, gltf };
  }
  const godot = join(path, 'project.godot');
  if (existsSync(godot)) {
    const text = await readFile(godot, 'utf8').catch(() => '');
    const name = /config\/name="([^"]+)"/.exec(text)?.[1] ?? basename(path);
    const features = /config\/features=PackedStringArray\("([\d.]+)"/.exec(text)?.[1] ?? null;
    return { path, name, engine: 'godot', engineVersion: features, target: DEFAULT_TARGET.godot, notes, gltf: true };
  }
  const uproject = (await readdir(path).catch(() => [] as string[])).find((f) => f.endsWith('.uproject'));
  if (uproject) {
    const text = await readFile(join(path, uproject), 'utf8').catch(() => '{}');
    let engineVersion: string | null = null;
    try {
      engineVersion = (JSON.parse(text) as { EngineAssociation?: string }).EngineAssociation ?? null;
    } catch {
      // not JSON: no version
    }
    notes.push('Unreal imports new files when “Auto Import” is on (Editor Preferences › Loading & Saving); otherwise use Import in the Content Browser.');
    return { path, name: uproject.replace(/\.uproject$/, ''), engine: 'unreal', engineVersion, target: DEFAULT_TARGET.unreal, notes, gltf: true };
  }
  notes.push('No game engine found here; assets are copied as plain files.');
  return { path, name: basename(path), engine: 'other', engineVersion: null, target: DEFAULT_TARGET.other, notes, gltf: true };
}
