/**
 * What the files inside a pack are. Every file gets:
 *
 * - a `kind`: what the file technically is (model, image, audio…), from its extension;
 * - a `type`: what it is to a game maker (3D model, texture, sprite, UI, SFX, music…), from its
 *   kind plus where it sits and what's around it;
 * - a `role`: `main` for the assets themselves, `support` for files that exist to serve them
 *   (a model's textures and buffers, .mtl files), `preview` for the pack's own screenshots, and
 *   `doc` for readmes and licences. Browsing shows main assets unless asked otherwise.
 */

export const KINDS = ['model', 'image', 'audio', 'font', 'material', 'data', 'doc', 'archive', 'other'] as const;
export type Kind = (typeof KINDS)[number];

export const ASSET_TYPES = ['model', 'texture', 'sprite', 'ui', 'hdri', 'sfx', 'music', 'font', 'other'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const TYPE_LABELS: Record<AssetType, string> = {
  model: '3D models',
  texture: 'Textures',
  sprite: 'Sprites & 2D',
  ui: 'UI & icons',
  hdri: 'HDRIs & skies',
  sfx: 'Sound effects',
  music: 'Music',
  font: 'Fonts',
  other: 'Other files',
};

/**
 * `variant` marks another copy of a main asset: the same model in another format, or the same
 * sprite at another size. Variants are listed with their asset, not on their own.
 */
export const ROLES = ['main', 'variant', 'support', 'preview', 'doc'] as const;
export type Role = (typeof ROLES)[number];

const EXT: Record<string, Kind> = {};
const add = (kind: Kind, exts: string) => {
  for (const e of exts.split(' ')) EXT[e] = kind;
};
add('model', 'glb gltf fbx obj dae blend stl ply 3ds usdz usd usda usdc x3d vox');
add('image', 'png jpg jpeg webp gif bmp tga psd tif tiff svg exr hdr ktx2 dds avif');
add('audio', 'wav ogg mp3 flac aif aiff m4a opus');
add('font', 'ttf otf woff woff2');
add('material', 'mtl');
add('doc', 'txt md pdf html htm rtf url');
// Sidecars that describe other files: spritesheet maps, glyph tables, engine import caches, checksums.
// ("import" is kept away from the end of the string: the bundler's CommonJS shim mistakes `import'` for a statement.)
add('data', 'json jsonl xml csv yaml yml plist atlas fnt md5 sha1 pb tres tscn stex oggstr import gd');
add('archive', 'zip 7z rar tar gz tgz');

/** Files that are never shown: OS clutter and engine sidecars that only mean something inside an engine. */
const IGNORED_NAME = /^(\.ds_store|thumbs\.db|desktop\.ini|\._.*)$/i;
const IGNORED_EXT = new Set(['meta', 'uid']);
const IGNORED_DIR = /(^|\/)(__macosx|\.git|\.svn)(\/|$)/i;

export const extOf = (name: string): string => {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
};

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export function isIgnored(path: string): boolean {
  return IGNORED_DIR.test(path) || IGNORED_NAME.test(baseName(path)) || IGNORED_EXT.has(extOf(path));
}

export function kindOf(path: string): Kind {
  return EXT[extOf(path)] ?? 'other';
}

/** Words in a path that mark what it holds. Tested against the path with separators normalised to spaces. */
const PREVIEW = /\b(preview|previews|thumbnail|thumb|screenshot|screenshots|cover|sample|showcase|promo|banner)\b/;
const UI = /\b(ui|gui|hud|icon|icons|button|buttons|cursor|cursors|panel|panels|menu|interface|crosshairs?)\b/;
const PBR = /\b(albedo|basecolor|base color|diffuse|normal|normalgl|normaldx|nrm|rough|roughness|metal|metallic|metalness|ao|ambientocclusion|occlusion|height|displacement|disp|opacity|alpha|emission|emissive|specular|gloss|col|color|colormap|arm|orm|mask|bump)\b/;
const MUSIC = /\b(music|song|songs|soundtrack|ost|bgm|theme|themes|ambient|ambience)\b/;
const SKY = /\b(hdri|hdr|sky|skies|skybox|skydome|panorama|equirect)\b/;
/** Plain "sky" is often a 2D background layer, so ordinary images need a stronger word to count as an HDRI. */
const SKY_STRONG = /\b(hdri|skybox|skydome|panorama|equirect)\b/;
const LICENCE_DOC = /\b(licen[cs]e|copying|credits?|readme|attribution)\b/;

/** Lower-case words of a path: separators, underscores, dashes and camelCase humps become spaces. */
export function pathWords(path: string): string {
  return path
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[/\\_\-.!+()[\]{},]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PackContext {
  /** The pack contains 3D models, so its images are most likely their textures. */
  hasModels: boolean;
}

export interface Classified {
  kind: Kind;
  type: AssetType;
  role: Role;
}

/** Audio files at least this big are probably music (about 90 s of a compressed track). */
const MUSIC_BYTES = 1_500_000;

/** Classify one file. `path` uses forward slashes; `size` in bytes. */
export function classify(path: string, size: number, ctx: PackContext): Classified {
  const kind = kindOf(path);
  const words = pathWords(path);
  const name = pathWords(baseName(path));
  switch (kind) {
    case 'model':
      return { kind, type: 'model', role: 'main' };
    case 'font':
      return { kind, type: 'font', role: 'main' };
    case 'material':
    case 'data':
      return { kind, type: 'other', role: 'support' };
    case 'doc':
      return { kind, type: 'other', role: 'doc' };
    case 'archive':
      return { kind, type: 'other', role: 'support' };
    case 'audio': {
      const music = MUSIC.test(words) || (size >= MUSIC_BYTES && !/\b(sfx|sound effects?|impact|hit|click)\b/.test(words));
      return { kind, type: music ? 'music' : 'sfx', role: 'main' };
    }
    case 'image': {
      const ext = extOf(path);
      if (PREVIEW.test(name) || /(^|\/)previews?\//i.test(path)) return { kind, type: 'sprite', role: 'preview' };
      if (ext === 'hdr' || (ext === 'exr' && SKY.test(words))) return { kind, type: 'hdri', role: 'main' };
      if (SKY_STRONG.test(name) && !ctx.hasModels) return { kind, type: 'hdri', role: 'main' };
      if (PBR.test(name) || ext === 'exr') return { kind, type: 'texture', role: ctx.hasModels ? 'support' : 'main' };
      if (ctx.hasModels) return { kind, type: 'texture', role: 'support' };
      if (UI.test(words)) return { kind, type: 'ui', role: 'main' };
      return { kind, type: 'sprite', role: 'main' };
    }
    default: {
      if (kind === 'other' && LICENCE_DOC.test(name)) return { kind: 'doc', type: 'other', role: 'doc' };
      const ext = extOf(path);
      // .bin buffers belong to glTF models.
      if (ext === 'bin') return { kind, type: 'other', role: 'support' };
      return { kind, type: 'other', role: 'main' };
    }
  }
}

/**
 * Folder names that only say which format or size the files inside are ("FBX format", "PNG",
 * "Double (128px)"). Files whose paths differ only in these folders and their extension are
 * variants of one asset.
 */
const VARIANT_DIR = /^(fbx|obj|glb|gltf|gltf ?binary|dae|collada|blend|blender|stl|ply|usdz?|3ds|models? ?(fbx|obj|glb|gltf)|(fbx|obj|glb|gltf|dae|blend) ?(format|files|models?|export)?|png|jpe?g|svg|vector|vectors|webp|tga|psd|default|double|retina|hd|sd|x?[0-9]+x|@?[0-9]x|\(?[0-9]+ ?px\)?|(default|double|large|small) ?\(?[0-9]+ ?px\)?|ogg|wav|mp3|flac|ttf|otf|woff2?)$/i;

/** Order of preference for the file that stands for a group of variants. */
const PREFERRED: Record<string, number> = { glb: 0, gltf: 1, fbx: 2, obj: 3, dae: 4, blend: 5, png: 0, webp: 1, jpg: 2, jpeg: 2, svg: 3, ogg: 0, wav: 1, mp3: 2, flac: 3, ttf: 0, otf: 1, woff2: 2, woff: 3 };
export const preference = (ext: string) => PREFERRED[ext] ?? 9;

/** The key shared by all variants of one asset: its kind, its folders minus format/size folders, and its name without extension. */
export function variantKey(kind: Kind, displayPath: string): string {
  const parts = displayPath.split('/');
  const file = parts.pop()!;
  const stem = file.includes('.') ? file.slice(0, file.lastIndexOf('.')) : file;
  const dirs = parts.filter((d) => !VARIANT_DIR.test(d.trim()));
  return `${kind}|${dirs.join('/').toLowerCase()}|${stem.toLowerCase()}`;
}
