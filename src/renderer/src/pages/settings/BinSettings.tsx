import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useQuery } from '@tanstack/react-query';
import { call } from '../../api';
import { formatBytes } from '../../components/labels';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { useSettings, useUpdateSettings } from '../../state/queries';
import { KEEP } from '../BinPage';
import { Row } from './parts';

/** How long the library's bin keeps things, and the way to it. The bin itself is a page. */
export function BinSettings() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const go = useNav((s) => s.go);
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const entries = useQuery({ queryKey: ['bin', lib, version], queryFn: () => call('bin:list'), enabled: !!lib }).data ?? [];

  return (
    <>
      <Row title="Keep deleted things for" body="After that they go for good, on the next read of the library.">
        <Select size="small" value={settings?.binKeepDays ?? 30} onChange={(e) => update.mutate({ binKeepDays: Number(e.target.value) })} sx={{ minWidth: 180 }}>
          {KEEP.map((k) => (
            <MenuItem key={k.value} value={k.value}>
              {k.label}
            </MenuItem>
          ))}
        </Select>
      </Row>
      <Row
        title={entries.length ? `${entries.length} thing${entries.length === 1 ? '' : 's'} waiting` : 'The bin is empty'}
        body={entries.length ? `${formatBytes(entries.reduce((n, e) => n + e.size, 0))} in all, waiting to be put back or emptied.` : 'Deleted packs and files wait in the bin until you empty it, or until the time above runs out.'}
      >
        <Button startIcon={<DeleteOutlineRounded />} onClick={() => go({ to: 'bin' })}>
          Open the bin
        </Button>
      </Row>
    </>
  );
}
