import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useBrowse } from '../state/browse';
import { useNav } from '../state/nav';
import { md, SHAPE } from '../theme';
import { NavigationRail } from './NavigationRail';
import { Activity } from './Activity';
import { LibrarySwitcher } from './LibrarySwitcher';
import { useStats } from '../state/library';
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
/** The search box searches the library: typing takes you to Browse. */
function GlobalSearch() {
  const text = useBrowse((s) => s.text);
  const setText = useBrowse((s) => s.setText);
  const go = useNav((s) => s.go);
  const empty = useStats().data?.assets === 0;
  return (
    <SearchField
      placeholder={empty ? 'Add packs to search them' : 'Search packs, assets and tags'}
      value={text}
      onChange={(v) => {
        setText(v);
        if (useNav.getState().route.to !== 'browse') go({ to: 'browse' });
      }}
    />
  );
}

export function AppShell({ children, onAdd, inboxCount, bare }: { children: ReactNode; onAdd: (anchor: HTMLElement) => void; inboxCount?: number; bare?: boolean }) {
  useHistoryKeys();
  if (bare) {
    // Full-bleed screens (welcome, opening): no bar, just a strip along the top to drag the window by.
    return (
      <div style={{ height: '100vh', position: 'relative', background: md('surface') }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag', zIndex: 5 } as CSSProperties} />
        {children}
      </div>
    );
  }
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: md('surfaceContainer') }}>
      <TopAppBar search={bare ? null : <GlobalSearch />} trailing={bare ? null : (
          <>
            <Activity />
            <LibrarySwitcher />
          </>
        )} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {!bare && <NavigationRail onAdd={onAdd} {...(inboxCount ? { inboxCount } : {})} />}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            background: md('surface'),
            borderTopLeftRadius: bare ? 0 : SHAPE.lg,
            overflow: 'hidden',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
