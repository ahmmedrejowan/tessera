import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined';
import Close from '@mui/icons-material/Close';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { formatBytes, formatCount } from '../../components/labels';
import { call } from '../../api';
import { ask } from '../../notices/dialogs';
import { failed, notify, useNotices } from '../../notices/store';
import { useBrowse } from '../../state/browse';
import { CopyButton } from '../projects/CopyButton';
import { md, mdAlpha, SHAPE } from '../../theme';
import { CollectionMenu } from '../collections/CollectionMenu';

/** What the picked things come to, read again whenever the pile changes. */
function useSize(mode: 'assets' | 'packs', selection: Set<number | string>): number | null {
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setBytes(null);
    const ids = [...selection];
    if (!ids.length) return;
    void call('browse:sum', mode, ids)
      .then((n) => live && setBytes(n))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mode, selection]);
  return bytes;
}

/** Buttons in the bar keep to one line, however many of them there are. */
const action = { color: md('inversePrimary'), whiteSpace: 'nowrap', flexShrink: 0 };

/** Floating bar for what's picked out in the grid: what can be done with it, and a way out. */
export function SelectionBar({ packs, total, all }: { packs?: boolean; total?: number; all?: () => Promise<(number | string)[]> } = {}) {
  const selection = useBrowse((s) => s.selection);
  const select = useBrowse((s) => s.select);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const bytes = useSize(packs ? 'packs' : 'assets', selection);
  // Toasts rise above the bar while it's showing.
  useEffect(() => {
    useNotices.getState().setLift(68);
    return () => useNotices.getState().setLift(0);
  }, []);
  /** What was picked, as files: asset ids directly, or everything inside the packs. */
  const refs = async () => {
    if (!packs) return call('assets:refs', [...selection].map(Number));
    const out: { packId: string; ref: string }[] = [];
    for (const id of [...selection].map(String)) {
      for (const file of await call('pack:files', id)) out.push({ packId: file.packId, ref: file.ref });
    }
    return out;
  };

  /** Move the picked packs to the wastebasket, once. */
  const remove = async () => {
    const ids = [...selection].map(String);
    const yes = await ask<boolean>({
      tone: 'warning',
      title: ids.length === 1 ? 'Remove this pack?' : `Remove ${ids.length} packs?`,
      body: 'Their folders go to the wastebasket. Anything already copied into a game stays where it is.',
      actions: [
        { label: 'Keep them', value: false, kind: 'text' },
        { label: 'Remove', value: true, kind: 'danger' },
      ],
    });
    if (!yes) return;
    let gone = 0;
    for (const id of ids) {
      try {
        await call('pack:remove', id);
        gone++;
      } catch (e) {
        failed(e);
      }
    }
    select([], null);
    if (gone) notify.success(gone === 1 ? 'The pack is in the wastebasket.' : `${gone} packs are in the wastebasket.`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 6px 6px 20px',
        borderRadius: SHAPE.full,
        background: md('inverseSurface'),
        color: md('inverseOnSurface'),
        boxShadow: `0 4px 16px ${mdAlpha('shadow', 0.25)}`,
      }}
    >
      <Typography variant="labelLarge" sx={{ mr: 1, whiteSpace: 'nowrap' }}>
        {formatCount(selection.size)} picked{bytes !== null ? ` · ${formatBytes(bytes)}` : ''}
      </Typography>
      {all && total !== undefined && total > selection.size && (
        <Button startIcon={<DoneAllRounded />} onClick={async () => select(await all())} sx={action}>
          Pick all {formatCount(total)}
        </Button>
      )}
      <Button startIcon={<BookmarkAddOutlined />} onClick={(e) => setAnchor(e.currentTarget)} sx={action}>
        {packs ? 'Collect their assets' : 'Add to collection'}
      </Button>
      <CopyButton items={refs} variant="text" size="medium" color={md('inversePrimary')} />
      {packs && (
        <Button startIcon={<DeleteOutlineRounded />} onClick={() => void remove()} sx={action}>
          Remove
        </Button>
      )}
      <IconButton aria-label="Clear selection" onClick={() => select([], null)} sx={{ color: md('inverseOnSurface') }}>
        <Close fontSize="small" />
      </IconButton>
      <CollectionMenu anchor={anchor} onClose={() => setAnchor(null)} items={refs} />
    </div>
  );
}
