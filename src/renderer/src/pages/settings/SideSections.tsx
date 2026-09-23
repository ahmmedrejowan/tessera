import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { md, SHAPE } from '../../theme';

export interface SideSection {
  id: string;
  title: string;
  /** Sections with the same group are listed together under its label. */
  group?: string;
}

export interface SideGroup {
  id: string;
  label: string;
  /** A line under the label: whose settings these are. */
  sub?: string;
  icon?: ReactNode;
}

/** How far below the top of the scroller a section counts as the one being read. */
const LIMIT = 108;

/**
 * Which section is being read, for the side list. The last one whose top has passed the top of
 * the page wins, and the bottom of the page always means the last section.
 */
export function useSectionSpy(scroller: RefObject<HTMLDivElement | null>, prefix: string, sections: SideSection[], ready: boolean): string {
  const [current, setCurrent] = useState(sections[0]?.id ?? '');
  useEffect(() => {
    const el = scroller.current;
    if (!el || !ready) return;
    const onScroll = () => {
      const limit = el.getBoundingClientRect().top + LIMIT;
      let at = sections[0]?.id ?? '';
      for (const s of sections) {
        const top = document.getElementById(`${prefix}-${s.id}`)?.getBoundingClientRect().top;
        if (top !== undefined && top <= limit) at = s.id;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) at = sections.at(-1)?.id ?? at;
      setCurrent(at);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scroller, prefix, sections, ready]);
  return current;
}

/** Jump the page to a section, leaving room for anything sticky at the top. */
export const jumpTo = (prefix: string, id: string) => document.getElementById(`${prefix}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** The anchor to put on a section, so the list can find and jump to it. */
export const sectionAnchor = (prefix: string, id: string) => ({ id: `${prefix}-${id}`, style: { scrollMarginTop: 84 } });

/** The list at the side of a long page: its sections, in groups, marking the one being read. */
export function SideSections({ prefix, sections, groups, current }: { prefix: string; sections: SideSection[]; groups?: SideGroup[]; current: string }) {
  const item = (s: SideSection) => (
    <ButtonBase
      key={s.id}
      onClick={() => jumpTo(prefix, s.id)}
      aria-current={current === s.id ? 'true' : undefined}
      sx={{
        justifyContent: 'flex-start',
        height: 40,
        px: 1.5,
        borderRadius: `${SHAPE.full}px`,
        color: current === s.id ? md('onSecondaryContainer') : md('onSurfaceVariant'),
        backgroundColor: current === s.id ? md('secondaryContainer') : 'transparent',
        '&:hover': { backgroundColor: current === s.id ? md('secondaryContainer') : md('surfaceContainerHigh') },
      }}
    >
      <Typography variant="labelLarge" noWrap sx={{ fontWeight: current === s.id ? 600 : 500 }}>
        {s.title}
      </Typography>
    </ButtonBase>
  );

  return (
    <nav aria-label="Sections" style={{ padding: '0 16px 32px 32px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', scrollbarGutter: 'stable' }}>
      {groups?.length
        ? groups.map((g) => (
            <div key={g.id} style={{ display: 'contents' }}>
              <div style={{ padding: '18px 12px 6px' }}>
                <Typography variant="labelLarge" noWrap sx={{ color: md('onSurface'), display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {g.icon}
                  {g.label}
                </Typography>
                {g.sub && (
                  <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant'), pl: g.icon ? 2.5 : 0 }}>
                    {g.sub}
                  </Typography>
                )}
              </div>
              {sections.filter((s) => s.group === g.id).map(item)}
            </div>
          ))
        : sections.map(item)}
    </nav>
  );
}
