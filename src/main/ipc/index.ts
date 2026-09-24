/**
 * Every channel the window can call, in one place, grouped by what it is about. Each group is a
 * file of its own and is given only the part of the app it needs.
 */
import { registerAgentIpc } from './agents';
import { registerAppIpc } from './app';
import { registerCollectionIpc } from './collections';
import { registerIncomingIpc } from './incoming';
import { registerLibraryIpc } from './libraries';
import { registerPackIpc } from './packs';
import { registerProjectIpc } from './projects';
import { registerSafetyIpc } from './safety';
import type { IpcContext } from './context';

export type { IpcContext } from './context';

export function registerIpc(c: IpcContext): void {
  registerAppIpc(c);
  registerLibraryIpc(c);
  registerPackIpc(c);
  registerCollectionIpc(c);
  registerProjectIpc(c);
  registerIncomingIpc(c);
  registerAgentIpc(c);
  registerSafetyIpc(c);
}
