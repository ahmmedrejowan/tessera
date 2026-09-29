import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { ClashChoice, CopyPlan } from '@shared/project';
import { call, on } from '../api';
import { failed, notify } from '../notices/store';
import { useLibraryId } from './library';
import { useNav } from './nav';
import { useSettings } from './queries';

export function useProjects() {
  const lib = useLibraryId();
  const client = useQueryClient();
  useEffect(() => on('projects:changed', () => void client.invalidateQueries({ queryKey: ['projects'] })), [client]);
  return useQuery({ queryKey: ['projects', lib], queryFn: () => call('projects:list'), enabled: !!lib, placeholderData: (p) => p });
}

/** The game that linking sends assets to, if it still exists. */
export function useActiveProject() {
  const id = useSettings().data?.activeProjectId ?? null;
  const projects = useProjects().data;
  return projects?.find((p) => p.id === id) ?? null;
}

type Items = { packId: string; ref: string }[];

interface CopyState {
  /** A copy waiting for the user to confirm, because something about it deserves a look. */
  pending: { projectId: string; projectName: string; items: Items; plan: CopyPlan } | null;
  confirm(onClash?: ClashChoice): Promise<void>;
  cancel(): void;
}

export const useCopy = create<CopyState>((set, get) => ({
  pending: null,
  async confirm(onClash) {
    const p = get().pending;
    set({ pending: null });
    if (p) await doCopy(p.projectId, p.projectName, p.items, onClash);
  },
  cancel: () => set({ pending: null }),
}));

async function doCopy(projectId: string, projectName: string, items: Items, onClash?: ClashChoice): Promise<void> {
  try {
    const n = await call('projects:copy', projectId, items, onClash);
    notify.success(`Linked ${n} asset${n === 1 ? '' : 's'} to ${projectName}: the files are in its folder now.`, { action: { label: 'Open', run: () => useNav.getState().go({ to: 'project', id: projectId }) } });
  } catch (e) {
    failed(e);
  }
}

/**
 * Copy assets into a project. License problems (non-commercial, unknown, still in Review) are
 * shown first and need a confirmation; otherwise it just goes.
 */
export async function copyToProject(project: { id: string; name: string } | null, items: Items): Promise<void> {
  if (!project) {
    notify.info('Link a game project first.', { action: { label: 'Projects', run: () => useNav.getState().go({ to: 'projects' }) } });
    return;
  }
  if (!items.length) return;
  try {
    const plan = await call('projects:plan', project.id, items);
    // Warnings always stop for an answer. Otherwise the person still sees what is about to be
    // written into their game, unless they have said they would rather not be asked.
    // A name the game already uses for a different file is a question only the person can answer,
    // so it is asked however the setting is left. Identical files are not a question.
    const ask = plan.warnings.length > 0 || plan.overwriting.length > 0 || (await call('settings:get')).confirmCopyToGame;
    if (ask) useCopy.setState({ pending: { projectId: project.id, projectName: project.name, items, plan } });
    else await doCopy(project.id, project.name, items);
  } catch (e) {
    failed(e);
  }
}
