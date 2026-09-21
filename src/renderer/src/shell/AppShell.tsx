import { useEffect, useState, type ReactNode } from 'react';
import { useNav } from '../state/nav';
import { md, SHAPE } from '../theme';
import { NavigationRail } from './NavigationRail';
import { SearchField, TopAppBar } from './TopAppBar';

/** Back/forward from the mouse's side buttons and ⌘[ / ⌘] (Alt+←/→ on Windows and Linux). */
function useHistoryKeys() {
  const { goBack, goForward } = useNav.getState();
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) goBack();
      if (e.button === 4) goForward();
    };
    const onKey = (e: KeyboardEvent) => {
      const mac = window.tessera.platform === 'darwin';
      if ((mac && e.metaKey && e.key === '[') || (!mac && e.altKey && e.key === 'ArrowLeft')) goBack();
      if ((mac && e.metaKey && e.key === ']') || (!mac && e.altKey && e.key === 'ArrowRight')) goForward();
    };
    window.addEventListener('mouseup', onMouse);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mouseup', onMouse);
      window.removeEventListener('keydown', onKey);
    };
  }, [goBack, goForward]);
}

/**
 * The window: app bar across the top, navigation rail down the left, and the current page on a
 * raised surface with a rounded corner — the chrome sits in the container colour, content above it.
 */
export function AppShell({ children, onAdd, inboxCount }: { children: ReactNode; onAdd: () => void; inboxCount?: number }) {
  useHistoryKeys();
  const [query, setQuery] = useState('');
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: md('surfaceContainer') }}>
      <TopAppBar search={<SearchField value={query} onChange={setQuery} />} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <NavigationRail onAdd={onAdd} {...(inboxCount ? { inboxCount } : {})} />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            background: md('surface'),
            borderTopLeftRadius: SHAPE.lg,
            overflow: 'hidden',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
