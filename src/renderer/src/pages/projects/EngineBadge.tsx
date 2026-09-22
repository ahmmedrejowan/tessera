import FolderOutlined from '@mui/icons-material/FolderOutlined';
import Typography from '@mui/material/Typography';
import type { Engine } from '@shared/project';
import { md, SHAPE } from '../../theme';

const MARK: Record<Engine, string | null> = { unity: 'U', godot: 'G', unreal: 'UE', other: null };

/** A small square that says which engine a project uses. */
export function EngineBadge({ engine, size = 40 }: { engine: Engine; size?: number }) {
  const mark = MARK[engine];
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: SHAPE.md,
        display: 'grid',
        placeItems: 'center',
        background: engine === 'other' ? md('surfaceContainerHighest') : md('tertiaryContainer'),
        color: engine === 'other' ? md('onSurfaceVariant') : md('onTertiaryContainer'),
      }}
    >
      {mark ? (
        <Typography variant="titleMedium" sx={{ fontWeight: 700, fontSize: size * 0.38 }}>
          {mark}
        </Typography>
      ) : (
        <FolderOutlined sx={{ fontSize: size * 0.5 }} />
      )}
    </div>
  );
}
