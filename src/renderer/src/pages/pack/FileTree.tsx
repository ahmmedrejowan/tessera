import ChevronRight from '@mui/icons-material/ChevronRight';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import FolderZipOutlined from '@mui/icons-material/FolderZipOutlined';
import Typography from '@mui/material/Typography';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import type { AssetRow } from '@shared/query';
import { formatBytes, TYPE_ICONS } from '../../components/labels';
import { md, SHAPE } from '../../theme';

interface Folder {
  kind: 'folder';
  path: string;
  name: string;
  depth: number;
  archive: boolean;
  folders: Map<string, Folder>;
  files: AssetRow[];
  size: number;
  count: number;
}

type Row = { kind: 'folder'; node: Folder } | { kind: 'file'; file: AssetRow; depth: number };

const ROLE_LABEL: Record<string, string> = { support: 'supporting', variant: 'variant', preview: 'preview', doc: 'document' };

function build(files: AssetRow[]): Folder {
  const root: Folder = { kind: 'folder', path: '', name: '', depth: -1, archive: false, folders: new Map(), files: [], size: 0, count: 0 };
  for (const f of files) {
    // Archives appear in the tree as the folder their contents sit in, not as a separate file.
    if (f.kind === 'archive' && files.some((o) => o.ref.startsWith(`${f.ref}!`))) continue;
    let node = root;
    const parts = f.dir ? f.dir.split('/') : [];
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let next = node.folders.get(part);
      if (!next) {
        next = { kind: 'folder', path, name: part, depth: i, archive: /\.zip$/i.test(part), folders: new Map(), files: [], size: 0, count: 0 };
        node.folders.set(part, next);
      }
      node = next;
    });
    node.files.push(f);
  }
  const total = (n: Folder): void => {
    for (const c of n.folders.values()) total(c);
    n.size = n.files.reduce((s, f) => s + f.size, 0) + [...n.folders.values()].reduce((s, c) => s + c.size, 0);
    n.count = n.files.length + [...n.folders.values()].reduce((s, c) => s + c.count, 0);
  };
  total(root);
  return root;
}

/** Every file in a pack as a folder tree; archives open like folders. Click a file to view it. */
export function FileTree({ files, onOpen }: { files: AssetRow[]; onOpen: (file: AssetRow) => void }) {
  const tree = useMemo(() => build(files), [files]);
  // Open the first two levels to start with, so the pack's layout is visible at a glance.
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (n: Folder) => {
      if (n.depth < 2) {
        s.add(n.path);
        for (const c of n.folders.values()) walk(c);
      }
    };
    walk(tree);
    return s;
  });
  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (n: Folder) => {
      for (const c of [...n.folders.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
        out.push({ kind: 'folder', node: c });
        if (open.has(c.path)) walk(c);
      }
      for (const f of [...n.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) out.push({ kind: 'file', file: f, depth: n.depth + 1 });
    };
    walk(tree);
    return out;
  }, [tree, open]);

  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => 36, overscan: 12 });

  const toggle = (path: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div ref={scroller} style={{ height: '100%', overflowY: 'auto', padding: '8px 24px 24px' }}>
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map((item) => {
          const row = rows[item.index]!;
          const depth = row.kind === 'folder' ? row.node.depth : row.depth;
          const style = { position: 'absolute' as const, top: 0, left: 0, right: 0, height: 36, transform: `translateY(${item.start}px)`, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8 + depth * 20, paddingRight: 12, borderRadius: SHAPE.sm, cursor: 'default' };
          if (row.kind === 'folder') {
            const n = row.node;
            const Icon = n.archive ? FolderZipOutlined : FolderOutlined;
            return (
              <div key={item.key} className="tile" style={style} onClick={() => toggle(n.path)} role="treeitem" aria-expanded={open.has(n.path)}>
                <ChevronRight sx={{ fontSize: 18, color: md('onSurfaceVariant'), transform: open.has(n.path) ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />
                <Icon sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
                <Typography variant="labelLarge" noWrap sx={{ flex: 1, color: md('onSurface') }}>
                  {n.name}
                </Typography>
                <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                  {n.count} · {formatBytes(n.size)}
                </Typography>
              </div>
            );
          }
          const f = row.file;
          const Icon = TYPE_ICONS[f.type];
          return (
            <div key={item.key} className="tile" style={style} onDoubleClick={() => onOpen(f)} onClick={() => onOpen(f)} role="treeitem">
              <span style={{ width: 18 }} />
              <Icon sx={{ fontSize: 20, color: md('onSurfaceVariant'), opacity: f.role === 'main' ? 1 : 0.6 }} />
              <Typography variant="bodyMedium" noWrap sx={{ flex: 1, color: f.role === 'main' ? md('onSurface') : md('onSurfaceVariant') }}>
                {f.name}
              </Typography>
              {f.role !== 'main' && (
                <Typography variant="labelSmall" sx={{ px: 0.75, borderRadius: `${SHAPE.xs}px`, border: `1px solid ${md('outlineVariant')}`, color: md('onSurfaceVariant') }}>
                  {ROLE_LABEL[f.role] ?? f.role}
                </Typography>
              )}
              <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), width: 72, textAlign: 'right' }}>
                {formatBytes(f.size)}
              </Typography>
            </div>
          );
        })}
      </div>
    </div>
  );
}
