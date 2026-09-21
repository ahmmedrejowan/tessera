import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Bridge } from '@shared/ipc';
import type { Platform } from '@shared/types';

const bridge: Bridge = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on(channel, listener) {
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
  platform: (['darwin', 'win32'].includes(process.platform) ? process.platform : 'linux') as Platform,
};

contextBridge.exposeInMainWorld('tessera', bridge);
