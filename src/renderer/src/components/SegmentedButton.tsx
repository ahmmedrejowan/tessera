import Check from '@mui/icons-material/Check';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md, mdAlpha, SHAPE, STATE } from '../theme';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * Material 3 segmented button: one choice among a few, the chosen one filled and ticked. Every
 * segment is the same width as the widest, so ticking one does not shift the others about.
 */
export function SegmentedButton<T extends string>({ value, options, onChange, label, width }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; width?: number }) {
  // Room for the longest label plus its tick, so the chosen one never makes the group jump.
  const each = width ?? Math.max(88, ...options.map((o) => 52 + o.label.length * 8));
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', height: 36, borderRadius: SHAPE.full, border: `1px solid ${md('outline')}`, overflow: 'hidden' }}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <ButtonBase
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            sx={{
              gap: 1,
              px: 1.5,
              width: each,
              justifyContent: 'center',
              borderLeft: i ? `1px solid ${md('outline')}` : 'none',
              backgroundColor: on ? md('secondaryContainer') : 'transparent',
              color: on ? md('onSecondaryContainer') : md('onSurface'),
              '&:hover': { backgroundColor: on ? md('secondaryContainer') : mdAlpha('onSurface', STATE.hover) },
            }}
          >
            {on ? <Check sx={{ fontSize: 18 }} /> : o.icon}
            <Typography variant="labelLarge">{o.label}</Typography>
          </ButtonBase>
        );
      })}
    </div>
  );
}
