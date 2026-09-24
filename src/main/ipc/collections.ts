/**
 * Collections: gatherings of packs and files.
 *
 * Every handler here answers one channel of the contract in src/shared/ipc.ts. What it needs is
 * given to it; nothing in this file reaches for a service of its own.
 */
import { handle } from '../ipc';
import type { IpcContext } from './context';

type Deps = Pick<IpcContext, 'library'>;

export function registerCollectionIpc(c: Deps): void {
  const { library } = c;
  handle('collections:list', () => library.collections());
  handle('collections:create', (name, init) => library.createCollection(name, init));
  handle('collections:change', (id, change) => library.changeCollection(id, change));
  handle('collections:holding', (packId, ref) => library.collectionsHolding(packId, ref));
}
