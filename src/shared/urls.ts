/**
 * URLs the window loads library files from. Each path segment of a ref is encoded on its own
 * ("!" stays literal), so relative links inside a model resolve to the files beside it.
 */
export const encodeRef = (ref: string) => ref.split('/').map((seg) => encodeURIComponent(seg).replace(/%21/g, '!')).join('/');

export const packFileUrl = (packId: string, ref: string) => `tessera://pack/${encodeURIComponent(packId)}/${encodeRef(ref)}`;

export const thumbUrl = (name: string) => `tessera://thumb/${name}`;

/** A stable name for a file of a pack, unlike database ids, which are reused after re-indexing. */
export const assetKey = (packId: string, ref: string) => `${packId}\n${ref}`;
export const splitAssetKey = (key: string) => {
  const i = key.indexOf('\n');
  return { packId: key.slice(0, i), ref: key.slice(i + 1) };
};
