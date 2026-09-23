import SortOutlined from '@mui/icons-material/SortOutlined';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { md } from '../theme';

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

/**
 * How a list is ordered. The same control on every page that shows a list, so the way to change
 * the order is always in the same place and says what the order is now.
 */
export function SortButton<T extends string>({ value, options, onChange, width = 164 }: { value: T; options: SortOption<T>[]; onChange: (value: T) => void; width?: number }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        startIcon={<SortOutlined />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Sort"
        sx={{ color: md('onSurfaceVariant'), px: 1.5, width, justifyContent: 'flex-start', flexShrink: 0 }}
      >
        <Typography variant="labelLarge" noWrap>
          {options.find((o) => o.value === value)?.label ?? 'Sort'}
        </Typography>
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {options.map((o) => (
          <MenuItem
            key={o.value}
            selected={o.value === value}
            onClick={() => {
              onChange(o.value);
              setAnchor(null);
            }}
          >
            {o.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
