/**
 * Who still has to upload a backup, and who does not.
 *
 * The answer decides what the window is allowed to claim. A folder inside a cloud app is written
 * and then uploaded by that app, on its own schedule, with no way back to say when it finished;
 * every other place Tessera sends the bytes itself. Getting this backwards either frightens
 * somebody whose backup is already safely away, or tells somebody their files are off the
 * computer while they are still sitting on the disk.
 */
import { describe, expect, it } from 'vitest';
import { cloudHandoff } from '../src/shared/storage';
import type { StorageTarget } from '../src/shared/storage';

const folder = (path: string): StorageTarget => ({ provider: 'folder', values: { path } });

describe('who still has to upload a backup', () => {
  it('names the app whose folder the backup was written into', () => {
    expect(cloudHandoff(folder('/Users/me/Library/Mobile Documents/Tessera'))).toBe('iCloud Drive');
    expect(cloudHandoff(folder('/Users/me/Google Drive/Backups'))).toBe('Google Drive');
    expect(cloudHandoff(folder('/Users/me/Dropbox/Tessera'))).toBe('Dropbox');
    expect(cloudHandoff(folder('/Users/me/OneDrive - Acme/Tessera'))).toBe('OneDrive');
    expect(cloudHandoff(folder('C:\\Users\\me\\Dropbox\\Tessera'))).toBe('Dropbox');
  });

  it('names nobody for a folder on this computer or a drive', () => {
    expect(cloudHandoff(folder('/Users/me/Backups'))).toBeNull();
    expect(cloudHandoff(folder('/Volumes/Backup Drive/Tessera'))).toBeNull();
  });

  it('names nobody when Tessera does the sending itself', () => {
    // Signed in: rclone uploads from here and knows when it is done.
    expect(cloudHandoff({ provider: 'gdrive', values: { remote: 'gd', folder: 'Tessera' } })).toBeNull();
    expect(cloudHandoff({ provider: 'dropbox', values: { remote: 'db', folder: 'Tessera' } })).toBeNull();
    // Written straight to the service.
    expect(cloudHandoff({ provider: 'aws', values: { bucket: 'b', region: 'us-east-1' } })).toBeNull();
    expect(cloudHandoff({ provider: 'sftp', values: { host: 'h' } })).toBeNull();
  });

  it('names nobody when there is no backup, or nowhere recorded', () => {
    expect(cloudHandoff(null)).toBeNull();
    expect(cloudHandoff({ provider: 'folder', values: {} })).toBeNull();
  });

  it('is not fooled by a folder merely named after one of them', () => {
    // The word has to be a folder in the path, not part of a longer name: somebody's own
    // "Dropbox Archive" folder is theirs, and nothing is going to upload it.
    expect(cloudHandoff(folder('/Users/me/Dropbox Archive/Tessera'))).toBeNull();
    expect(cloudHandoff(folder('/Users/me/My Google Drive Notes'))).toBeNull();
  });
});
