/**
 * What the handlers are given. The app builds its services once, in index.ts, and hands this to
 * each group of handlers; a group asks for the part of it that it needs, and nothing else. That
 * is the whole of the arrangement: index.ts puts the app together, these files answer the window.
 */
import type { BrowserWindow } from 'electron';
import type { LibraryRecord, Platform, Settings } from '@shared/types';
import type { Activity } from '../activity';
import type { BackupService } from '../backup/service';
import type { RcloneAuth } from '../backup/rclone';
import type { RestoreService } from '../backup/restore';
import type { DownloadService } from '../downloads/service';
import type { Jobs } from '../jobs';
import type { LibraryService } from '../libraryService';
import type { McpHistory } from '../mcp/history';
import type { McpService } from '../mcp/server';
import type { ProjectService } from '../projects/service';
import type { CopySource } from '../projects/copy';
import type { ReportService } from '../reports/service';
import type { SettingsStore } from '../settings';
import type { SyncService } from '../sync/service';
import type { ThumbService } from '../thumbs/service';
import type { Updates } from '../updates';
import type { LibrarySummary } from '@shared/types';

export interface IpcContext {
  /** Where the app keeps its own data. */
  dataDir: string;
  platform: Platform;
  /** The windows to tell when something changes. */
  windows: () => BrowserWindow[];

  settings: SettingsStore;
  library: LibraryService;
  projects: ProjectService;
  downloads: DownloadService;
  thumbs: ThumbService;
  backups: BackupService;
  restorer: RestoreService;
  rcloneAuth: RcloneAuth;
  sync: SyncService;
  updates: Updates;
  reports: ReportService;
  activity: Activity;
  jobs: Jobs;
  mcp: McpService;
  mcpHistory: McpHistory;

  /** Something changed that every window should hear about. */
  indexChanged: () => void;
  librariesChanged: () => void;
  projectsChanged: () => void;
  backupChanged: () => void;
  syncChanged: () => void;

  /** The open library's id, or a clear refusal when none is. */
  libraryId: () => string;
  libraryNameOf: (id: string) => string | null;
  librarySummaries: () => Promise<LibrarySummary[]>;
  /** Everything a copy into a game needs to read from the library. */
  copySource: () => CopySource;
  /** The record of the open library, as the list of libraries keeps it, or null when none is. */
  openRecord: () => LibraryRecord | null;
  /** Where the thumbnails of the open library are kept. */
  thumbDir: () => string | null;
  /** One of the documents the app ships: the licence, the changelog, the privacy page. */
  readDocument: (name: 'licence' | 'changelog' | 'privacy') => Promise<string>;
  /** Keep a copy of the page a pack came from, in the background. */
  recordPage: (id: string, what: { snapshot: boolean; archive: boolean }) => void;
  /** Start the app's services again, after a restore. */
  start: () => Promise<void>;

  /** Settings as the handlers see them, for the few that read them directly. */
  currentSettings?: Settings;
}
