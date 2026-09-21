/**
 * URLs the window loads library files from. Each path segment of a ref is encoded on its own
 * ("!" stays literal), so relative links inside a model resolve to the files beside it.
 */
export const encodeRef = (ref: string) => ref.split('/').map((seg) => encodeURIComponent(seg).replace(/%21/g, '!')).join('/');

export const packFileUrl = (packId: string, ref: string) => `tessera://pack/${encodeURIComponent(packId)}/${encodeRef(ref)}`;

export const thumbUrl = (name: string) => `tessera://thumb/${name}`;
