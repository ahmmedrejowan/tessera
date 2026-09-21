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

/** Material 3 segmented button: one choice among a few, the chosen one filled and ticked. */
export function SegmentedButton<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string }) {
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
              px: 2,
              minWidth: 88,
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
