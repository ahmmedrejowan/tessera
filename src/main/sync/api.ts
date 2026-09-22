/** A small client for the parts of Syncthing's REST API that Tessera uses. */

export interface StFolder {
  id: string;
  label: string;
  path: string;
  type: 'sendreceive' | 'sendonly' | 'receiveonly' | 'receiveencrypted';
  devices: { deviceID: string }[];
  paused?: boolean;
  versioning?: { type: string; params: Record<string, string> };
  [key: string]: unknown;
}

export interface StDevice {
  deviceID: string;
  name: string;
  addresses?: string[];
  autoAcceptFolders?: boolean;
  paused?: boolean;
  [key: string]: unknown;
}

export class SyncthingApi {
  constructor(
    private readonly base: string,
    private readonly key: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'X-API-Key': this.key, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Syncthing said ${res.status} to ${method} ${path}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get = <T>(path: string) => this.request<T>('GET', path);
  put = <T>(path: string, body: unknown) => this.request<T>('PUT', path, body);
  post = <T>(path: string, body: unknown) => this.request<T>('POST', path, body);
  patch = <T>(path: string, body: unknown) => this.request<T>('PATCH', path, body);
  delete = <T>(path: string) => this.request<T>('DELETE', path);

  async myId(): Promise<string> {
    return (await this.get<{ myID: string }>('/rest/system/status')).myID;
  }

  folders = () => this.get<StFolder[]>('/rest/config/folders');
  devices = () => this.get<StDevice[]>('/rest/config/devices');
  connections = () => this.get<{ connections: Record<string, { connected: boolean }> }>('/rest/system/connections');
  folderStatus = (id: string) => this.get<{ state: string; needFiles: number; needBytes: number; globalBytes: number; inSyncBytes: number; errors: number }>(`/rest/db/status?folder=${encodeURIComponent(id)}`);
  completion = (folder: string, device: string) => this.get<{ completion: number }>(`/rest/db/completion?folder=${encodeURIComponent(folder)}&device=${encodeURIComponent(device)}`);
  pendingDevices = () => this.get<Record<string, { name: string; address: string; time: string }>>('/rest/cluster/pending/devices');
  pendingFolders = () => this.get<Record<string, { offeredBy: Record<string, { label: string; time: string }> }>>('/rest/cluster/pending/folders');
}
