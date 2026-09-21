import { contextBridge, ipcRenderer } from 'electron';
import type { RenderJob, RenderResult } from '@shared/types';

/** The render window's only link to the app: jobs in, results out. */
contextBridge.exposeInMainWorld('renderBridge', {
  onJob(listener: (job: RenderJob) => void) {
    ipcRenderer.on('render:job', (_e, job: RenderJob) => listener(job));
  },
  done(result: RenderResult) {
    ipcRenderer.send('render:result', result);
  },
});
