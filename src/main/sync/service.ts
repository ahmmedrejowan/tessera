import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { SyncMode, SyncStatus } from '@shared/types';
import { UserError } from '../errors';
import { log } from '../log';
import type { SettingsStore } from '../settings';
import { findTool } from '../tools/find';
import { SyncthingApi, type StFolder } from './api';

/** How each mode maps to a Syncthing folder type. */
export const FOLDER_TYPE: Record<SyncMode, StFolder['type']> = { push: 'sendonly', pull: 'receiveonly', full: 'sendreceive' };

/** Starts Syncthing and says where its API is. Replaced in tests. */
export type Launcher = (home: string) => Promise<{ base: string; key: string; stop: () => void }>;

interface Deps {
  dataDir: string;
  settings: SettingsStore;
  library: () => { id: string; name: string; path: string } | null;
  onChange: () => void;
  launcher?: Launcher;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => (typeof addr === 'object' && addr ? resolve(addr.port) : reject(new Error('no port'))));
    });
  });

/** Run Tessera's own Syncthing: its own settings folder, its own identity, API on localhost only. */
export const launchSyncthing: Launcher = async (home) => {
  const exe = findTool('syncthing', ['/Applications/Syncthing.app/Contents/Resources/syncthing/syncthing']);
  if (!exe) throw new UserError('no-syncthing', 'Syncthing isn’t installed. Get it from syncthing.net, then try again.');
  await mkdir(home, { recursive: true });
  const env = { ...process.env, STNODEFAULTFOLDER: '1', STNOUPGRADE: '1' };
  if (!existsSync(join(home, 'config.xml'))) {
    await new Promise<void>((resolve, reject) => {
      const p = spawn(exe, ['generate', `--home=${home}`], { env, stdio: 'ignore' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Syncthing couldn’t set itself up (exit ${code})`))));
      p.on('error', reject);
    });
  }
  const port = await freePort();
  const key = randomBytes(24).toString('hex');
  const proc: ChildProcess = spawn(exe, ['serve', `--home=${home}`, '--no-browser', `--gui-address=127.0.0.1:${port}`, `--gui-apikey=${key}`], { env, stdio: 'ignore' });
  proc.on('exit', (code) => log.info('sync', `Syncthing stopped (${code})`));
  const base = `http://127.0.0.1:${port}`;
  // Wait for the API to answer.
  const api = new SyncthingApi(base, key);
  for (let i = 0; i < 60; i++) {
    try {
      await api.myId();
      return { base, key, stop: () => proc.kill() };
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  proc.kill();
  throw new Error('Syncthing didn’t start.');
};

/**
 * Keeping a library in step across computers with Syncthing. Off until the user turns it on;
 * then Tessera runs a private Syncthing and shares the library folder in the chosen mode:
 * push only (this computer sends), pull only (it receives), or full (both ways).
 */
export class SyncService {
  private api: SyncthingApi | null = null;
  private stop: (() => void) | null = null;
  private starting: Promise<SyncthingApi> | null = null;

  constructor(private readonly d: Deps) {}

  private get home() {
    return join(this.d.dataDir, 'syncthing');
  }

  private folderId(libraryId: string) {
    return `tessera-${libraryId}`;
  }

  available(): boolean {
    return !!(this.d.launcher ?? findTool('syncthing', ['/Applications/Syncthing.app/Contents/Resources/syncthing/syncthing']));
  }

  private ensureRunning(): Promise<SyncthingApi> {
    if (this.api) return Promise.resolve(this.api);
    this.starting ??= (async () => {
      const { base, key, stop } = await (this.d.launcher ?? launchSyncthing)(this.home);
      this.api = new SyncthingApi(base, key);
      this.stop = stop;
      return this.api;
    })().finally(() => (this.starting = null));
    return this.starting;
  }

  /** Share the open library in the current mode (creating or updating the folder). */
  private async shareLibrary(api: SyncthingApi, mode: SyncMode): Promise<void> {
    const lib = this.d.library();
    if (!lib) return;
    const id = this.folderId(lib.id);
    const existing = (await api.folders()).find((f) => f.id === id);
    // In full mode a change from another computer can replace or delete files: keep what was
    // there for 30 days instead of losing it.
    const versioning = mode === 'full' ? { type: 'trashcan', params: { cleanoutDays: '30' } } : { type: '', params: {} };
    if (existing) {
      await api.patch(`/rest/config/folders/${id}`, { type: FOLDER_TYPE[mode], path: lib.path, label: lib.name, versioning, paused: false });
    } else {
      await api.post('/rest/config/folders', { id, label: lib.name, path: lib.path, type: FOLDER_TYPE[mode], devices: [], versioning, fsWatcherEnabled: true, rescanIntervalS: 3600 });
    }
  }

  /** Start Syncthing without a library, to receive one from another computer. */
  async startForReceiving(): Promise<void> {
    await this.ensureRunning();
    this.d.onChange();
  }

  /** Called when a library opens: resume syncing it if sync is on. */
  async resume(): Promise<void> {
    const s = this.d.settings.get();
    if (!s.syncEnabled || !this.available()) return;
    try {
      await this.shareLibrary(await this.ensureRunning(), s.syncMode);
      this.d.onChange();
    } catch (e) {
      log.warn('sync', 'could not resume syncing', e);
    }
  }

  async enable(mode: SyncMode): Promise<void> {
    if (!this.d.library()) throw new UserError('no-library', 'Open a library first.');
    await this.shareLibrary(await this.ensureRunning(), mode);
    await this.d.settings.update({ syncEnabled: true, syncMode: mode });
    this.d.onChange();
  }

  async setMode(mode: SyncMode): Promise<void> {
    await this.shareLibrary(await this.ensureRunning(), mode);
    await this.d.settings.update({ syncMode: mode });
    this.d.onChange();
  }

  /** Stop syncing. This computer's identity and paired computers are kept for next time. */
  async disable(): Promise<void> {
    const lib = this.d.library();
    if (this.api && lib) await this.api.patch(`/rest/config/folders/${this.folderId(lib.id)}`, { paused: true }).catch(() => undefined);
    this.shutdown();
    await this.d.settings.update({ syncEnabled: false });
    this.d.onChange();
  }

  shutdown(): void {
    this.stop?.();
    this.stop = null;
    this.api = null;
  }

  /** Pair with another computer by its device ID and share the library with it. */
  async addDevice(deviceId: string, name: string): Promise<void> {
    const id = deviceId.trim().toUpperCase();
    if (!/^[A-Z2-7]{7}(-[A-Z2-7]{7}){7}$/.test(id)) throw new UserError('bad-device-id', 'That doesn’t look like a device ID. It’s eight groups of seven letters and digits.');
    const api = await this.ensureRunning();
    if (id === (await api.myId())) throw new UserError('own-device', 'That’s this computer’s own ID.');
    const devices = await api.devices();
    if (!devices.some((d) => d.deviceID === id)) await api.post('/rest/config/devices', { deviceID: id, name: name.trim() || 'Computer', addresses: ['dynamic'], autoAcceptFolders: false });
    await this.shareWith(api, id);
    this.d.onChange();
  }

  private async shareWith(api: SyncthingApi, deviceId: string): Promise<void> {
    const lib = this.d.library();
    if (!lib) return;
    const id = this.folderId(lib.id);
    const folder = (await api.folders()).find((f) => f.id === id);
    if (folder && !folder.devices.some((d) => d.deviceID === deviceId)) {
      await api.patch(`/rest/config/folders/${id}`, { devices: [...folder.devices, { deviceID: deviceId }] });
    }
  }

  async removeDevice(deviceId: string): Promise<void> {
    const api = await this.ensureRunning();
    await api.delete(`/rest/config/devices/${deviceId}`);
    this.d.onChange();
  }

  /**
   * On a computer receiving a library for the first time: accept the folder another computer
   * offers and put it at `path` (a new, empty folder), where it arrives as a library to open.
   */
  async acceptFolder(folderId: string, offeredBy: string, label: string, path: string, mode: SyncMode): Promise<void> {
    const api = await this.ensureRunning();
    await mkdir(path, { recursive: true });
    const versioning = mode === 'full' ? { type: 'trashcan', params: { cleanoutDays: '30' } } : { type: '', params: {} };
    await api.post('/rest/config/folders', { id: folderId, label, path, type: FOLDER_TYPE[mode], devices: [{ deviceID: offeredBy }], versioning, fsWatcherEnabled: true });
    this.d.onChange();
  }

  async status(): Promise<SyncStatus> {
    const s = this.d.settings.get();
    const base: SyncStatus = { available: this.available(), enabled: s.syncEnabled, mode: s.syncMode, running: !!this.api, myId: null, devices: [], folder: null, pendingDevices: [], pendingFolders: [] };
    if (!this.api) return base;
    try {
      const api = this.api;
      const lib = this.d.library();
      const folderId = lib ? this.folderId(lib.id) : null;
      const [myId, devices, connections, folders, pendingDevices, pendingFolders] = await Promise.all([
        api.myId(),
        api.devices(),
        api.connections(),
        api.folders(),
        api.pendingDevices().catch(() => ({})),
        api.pendingFolders().catch(() => ({})),
      ]);
      const folder = folders.find((f) => f.id === folderId);
      const others = devices.filter((d) => d.deviceID !== myId);
      const withCompletion = await Promise.all(
        others.map(async (d) => ({
          id: d.deviceID,
          name: d.name,
          connected: !!connections.connections[d.deviceID]?.connected,
          shared: !!folder?.devices.some((x) => x.deviceID === d.deviceID),
          completion: folder ? ((await api.completion(folder.id, d.deviceID).catch(() => null))?.completion ?? null) : null,
        })),
      );
      const fs = folder ? await api.folderStatus(folder.id).catch(() => null) : null;
      return {
        ...base,
        myId,
        devices: withCompletion,
        folder: fs ? { state: fs.state, needBytes: fs.needBytes, errors: fs.errors } : null,
        pendingDevices: Object.entries(pendingDevices).map(([id, p]) => ({ id, name: p.name })),
        pendingFolders: Object.entries(pendingFolders).flatMap(([id, p]) => Object.entries(p.offeredBy).map(([by, o]) => ({ id, label: o.label, offeredBy: by }))),
      };
    } catch (e) {
      log.warn('sync', 'status failed', e);
      return base;
    }
  }
}
