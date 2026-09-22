import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { useImport } from '../state/importer';
import { md, mdAlpha, SHAPE } from '../theme';

/** Files dragged anywhere over the window can be dropped to add them. */
export function DropOverlay({ enabled }: { enabled: boolean }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const plan = useImport((s) => s.plan);

  useEffect(() => {
    if (!enabled) return;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const paths = window.tessera.pathsFor([...(e.dataTransfer?.files ?? [])]);
      void plan(paths);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, [enabled, plan]);

  if (!over) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: mdAlpha('scrim', 0.32), display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
      <div style={{ padding: '40px 64px', borderRadius: SHAPE.xl, background: md('primaryContainer'), color: md('onPrimaryContainer'), border: `2px dashed ${md('primary')}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <FileDownloadOutlined sx={{ fontSize: 48 }} />
        <Typography variant="headlineSmall">Drop to add to your library</Typography>
        <Typography variant="bodyMedium">Zips, folders or files. Your originals are left as they are.</Typography>
      </div>
    </div>
  );
}
