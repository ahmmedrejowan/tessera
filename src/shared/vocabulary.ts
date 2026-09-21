/**
 * Starter words for a pack's genre and style. They're suggestions, not a fixed list: anything the
 * user types is kept, and words already used in the library are offered first.
 */

export const GENRES = [
  'fantasy', 'medieval', 'sci-fi', 'space', 'cyberpunk', 'post-apocalyptic', 'horror', 'western', 'pirate',
  'military', 'modern', 'city', 'nature', 'farm', 'dungeon', 'platformer', 'racing', 'sports', 'casual',
  'puzzle', 'board & cards', 'retro', 'kids', 'holiday', 'industrial', 'underwater',
];

export const STYLES = [
  'low-poly', 'stylised', 'realistic', 'pixel art', 'voxel', 'hand-painted', 'cartoon', 'flat', 'isometric',
  '1-bit', 'cute', 'toon', 'minimal', 'line art', 'pbr',
];

/** Tidy a word the user typed: trimmed, lower-case, single spaces. */
export const normaliseTerm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
