import Typography from '@mui/material/Typography';
import { licenseInfo } from '@shared/licenses';
import { md, SHAPE } from '../theme';

/**
 * A license at a glance, colored by what it asks of you: free to use as-is, needs a credit,
 * can't be sold in a game, or unknown.
 */
export function licenseTone(id: string | null): 'free' | 'credit' | 'restricted' | 'unknown' {
  const l = licenseInfo(id);
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

export function LicenseChip({ id }: { id: string | null }) {
  const tone = TONES[licenseTone(id)];
  return (
    <Typography
      component="span"
      variant="labelMedium"
      sx={{ display: 'inline-block', px: 1, py: '2px', borderRadius: `${SHAPE.sm}px`, backgroundColor: md(tone.bg), color: md(tone.fg), whiteSpace: 'nowrap' }}
    >
      {licenseInfo(id)?.short ?? (id || 'No license')}
    </Typography>
  );
}

/** One sentence on what the license means for a game. */
export function licenseSummary(id: string | null): string {
  const l = licenseInfo(id);
  if (!l) return id ? 'A license Tessera doesn’t know. Check the proof files.' : 'No license recorded yet. Add one before using this pack in a game.';
  const parts: string[] = [];
  parts.push(l.commercial ? 'Fine in commercial games' : 'Not for commercial games');
  if (l.attribution) parts.push('credit the author');
  if (l.shareAlike) parts.push('share changed versions under the same license');
  if (!l.modify) parts.push('don’t modify it');
  return `${parts.join('; ')}.`;
}
