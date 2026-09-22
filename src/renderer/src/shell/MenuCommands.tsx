import { useEffect } from 'react';
import { on } from '../api';
import { useLinkProject } from '../pages/projects/ProjectsPage';
import { useImport } from '../state/importer';
import { useNav } from '../state/nav';
import { usePalette } from './CommandPalette';

/** Carries out what the application menu asks for. */
export function MenuCommands() {
  const link = useLinkProject();
  useEffect(
    () =>
      on('menu:command', (command) => {
        const { go } = useNav.getState();
        const { choose } = useImport.getState();
        switch (command) {
          case 'add':
            return void choose('files');
          case 'addFolder':
            return void choose('folder');
          case 'addFolderOfPacks':
            return void choose('folderOfPacks');
          case 'linkProject':
            return void link.start();
          case 'palette':
            return usePalette.getState().toggle();
          case 'find':
            return document.getElementById('global-search')?.focus();
          case 'reportProblem':
            // Handled by the report dialog, which listens whether or not a library is open.
            return;
          default:
            return go({ to: command });
        }
      }),
    [link],
  );
  return link.dialog;
}
