import { create } from 'zustand';

/** The top-level destinations on the navigation rail. */
export type Destination = 'home' | 'browse' | 'collections' | 'projects' | 'inbox' | 'downloads' | 'help' | 'about' | 'settings';

export type Route =
  | { to: Destination }
  | { to: 'settings'; section: string }
  | { to: 'adding' }
  | { to: 'pack'; id: string }
  | { to: 'collection'; id: string }
  | { to: 'project'; id: string }
  | { to: 'helpTopic'; id: string; question?: string };

/** The rail destination a route belongs under (a pack page sits under Browse). */
export const railOf = (r: Route): Destination =>
  r.to === 'adding' ? 'inbox' : r.to === 'pack' ? 'browse' : r.to === 'collection' ? 'collections' : r.to === 'project' ? 'projects' : r.to === 'helpTopic' ? 'help' : r.to;

interface NavState {
  route: Route;
  back: Route[];
  forward: Route[];
  go(route: Route): void;
  goBack(): void;
  goForward(): void;
}

const same = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b);

/** Where the app is, with back/forward history like a browser (mouse buttons and ⌘[ / ⌘] use it). */
export const useNav = create<NavState>((set, get) => ({
  route: { to: 'home' },
  back: [],
  forward: [],
  go(route) {
    const { route: current, back } = get();
    if (same(current, route)) return;
    set({ route, back: [...back, current].slice(-50), forward: [] });
  },
  goBack() {
    const { route, back, forward } = get();
    const prev = back.at(-1);
    if (prev) set({ route: prev, back: back.slice(0, -1), forward: [route, ...forward] });
  },
  goForward() {
    const { route, back, forward } = get();
    const next = forward[0];
    if (next) set({ route: next, back: [...back, route], forward: forward.slice(1) });
  },
}));
