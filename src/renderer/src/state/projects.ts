import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { CopyPlan } from '@shared/project';
import { call, on } from '../api';
import { toast } from '../components/Toast';
import { useLibraryId } from './library';
import { useNav } from './nav';
import { useSettings } from './queries';

export function useProjects() {
  const lib = useLibraryId();
  const client = useQueryClient();
  useEffect(() => on('projects:changed', () => void client.invalidateQueries({ queryKey: ['projects'] })), [client]);
  return useQuery({ queryKey: ['projects', lib], queryFn: () => call('projects:list'), enabled: !!lib, placeholderData: (p) => p });
}

/** The project "Copy to project" sends to, if it still exists. */
export function useActiveProject() {
  const id = useSettings().data?.activeProjectId ?? null;
  const projects = useProjects().data;
  return projects?.find((p) => p.id === id) ?? null;
}

type Items = { packId: string; ref: string }[];

interface CopyState {
  /** A copy waiting for the user to confirm, because something about it deserves a look. */
  pending: { projectId: string; projectName: string; items: Items; plan: CopyPlan } | null;
  confirm(): Promise<void>;
  cancel(): void;
}

export const useCopy = create<CopyState>((set, get) => ({
  pending: null,
  async confirm() {
    const p = get().pending;
    set({ pending: null });
    if (p) await doCopy(p.projectId, p.projectName, p.items);
  },
  cancel: () => set({ pending: null }),
}));

async function doCopy(projectId: string, projectName: string, items: Items): Promise<void> {
  try {
    const n = await call('projects:copy', projectId, items);
    toast(`Copied ${n} asset${n === 1 ? '' : 's'} to ${projectName}.`, { label: 'Open', run: () => useNav.getState().go({ to: 'project', id: projectId }) });
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Copy assets into a project. Licence problems (non-commercial, unknown, still in the Inbox) are
 * shown first and need a confirmation; otherwise it just goes.
 */
export async function copyToProject(project: { id: string; name: string } | null, items: Items): Promise<void> {
  if (!project) {
    toast('Link a game project first.', { label: 'Projects', run: () => useNav.getState().go({ to: 'projects' }) });
    return;
  }
  if (!items.length) return;
  try {
    const plan = await call('projects:plan', project.id, items);
    if (plan.warnings.length) useCopy.setState({ pending: { projectId: project.id, projectName: project.name, items, plan } });
    else await doCopy(project.id, project.name, items);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  }
}
