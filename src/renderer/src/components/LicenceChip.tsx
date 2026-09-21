import Typography from '@mui/material/Typography';
import { licenceInfo } from '@shared/licences';
import { md, SHAPE } from '../theme';

/**
 * A licence at a glance, coloured by what it asks of you: free to use as-is, needs a credit,
 * can't be sold in a game, or unknown.
 */
export function licenceTone(id: string | null): 'free' | 'credit' | 'restricted' | 'unknown' {
  const l = licenceInfo(id);
  if (!l) return 'unknown';
  if (!l.commercial) return 'restricted';
  if (l.attribution || l.shareAlike) return 'credit';
  return 'free';
}

const TONES = {
  free: { bg: 'secondaryContainer', fg: 'onSecondaryContainer' },
  credit: { bg: 'tertiaryContainer', fg: 'onTertiaryContainer' },
  restricted: { bg: 'errorContainer', fg: 'onErrorContainer' },
  unknown: { bg: 'surfaceContainerHighest', fg: 'onSurfaceVariant' },
} as const;

export function LicenceChip({ id }: { id: string | null }) {
  const tone = TONES[licenceTone(id)];
  return (
    <Typography
      component="span"
      variant="labelMedium"
      sx={{ display: 'inline-block', px: 1, py: '2px', borderRadius: `${SHAPE.sm}px`, backgroundColor: md(tone.bg), color: md(tone.fg), whiteSpace: 'nowrap' }}
    >
      {licenceInfo(id)?.short ?? (id || 'No licence')}
    </Typography>
  );
}

/** One sentence on what the licence means for a game. */
export function licenceSummary(id: string | null): string {
  const l = licenceInfo(id);
  if (!l) return id ? 'A licence Tessera doesn’t know. Check the proof files.' : 'No licence recorded yet. Add one before using this pack in a game.';
  const parts: string[] = [];
  parts.push(l.commercial ? 'Fine in commercial games' : 'Not for commercial games');
  if (l.attribution) parts.push('credit the author');
  if (l.shareAlike) parts.push('share changed versions under the same licence');
  if (!l.modify) parts.push('don’t modify it');
  return `${parts.join('; ')}.`;
}
