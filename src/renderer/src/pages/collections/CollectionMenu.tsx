import AddOutlined from '@mui/icons-material/AddOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import type { CollectionItem, SmartQuery } from '@shared/collection';
import { addToCollection, newCollection, useCollections } from '../../state/collections';
import { CollectionIcon } from '../../components/icons';
import { useNewCollection } from './CollectionDialog';

/** A dialog asking for a collection's name. */
export function NameDialog({ open, title, initial = '', action, onClose, onDone }: { open: boolean; title: string; initial?: string; action: string; onClose: () => void; onDone: (name: string, description: string) => void }) {
  const [name, setName] = useState(initial);
  const [description, setDescription] = useState('');
  const submit = () => name.trim() && onDone(name.trim(), description.trim());
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth slotProps={{ transition: { onEnter: () => (setName(initial), setDescription('')) } }}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField autoFocus label="Name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} sx={{ mt: 1 }} />
        <TextField label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} multiline />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={submit}>
          {action}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * "Add to collection": the manual collections, newest first, and a new one. What is added is asked
 * for when a choice is made, so a large selection is only resolved if it's needed. A pack joins as
 * itself (`packs`), not as its files.
 */
export function CollectionMenu({
  anchor,
  onClose,
  items,
  packs,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  items?: () => Promise<CollectionItem[]>;
  packs?: () => Promise<string[]>;
}) {
  const collections = (useCollections().data ?? []).filter((c) => c.kind === 'manual').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <Menu anchorEl={anchor} open={!!anchor} onClose={onClose} slotProps={{ paper: { sx: { minWidth: 260, maxHeight: 420 } } }}>
        <MenuItem
          onClick={async () => {
            // The things being added are read before the menu goes, since it takes its callbacks with it.
            const [chosen, chosenPacks] = [(await items?.()) ?? [], (await packs?.()) ?? []];
            onClose();
            useNewCollection.getState().start(chosen, chosenPacks);
          }}
        >
          <ListItemIcon>
            <AddOutlined />
          </ListItemIcon>
          <ListItemText primary="New collection…" />
        </MenuItem>
        {collections.length > 0 && <Divider />}
        {collections.map((c) => (
          <MenuItem
            key={c.id}
            onClick={async () => {
              onClose();
              await addToCollection(c.id, c.name, (await items?.()) ?? [], (await packs?.()) ?? []);
            }}
          >
            <ListItemIcon>
              <CollectionIcon />
            </ListItemIcon>
            <ListItemText primary={c.name} secondary={[c.packCount ? `${c.packCount} pack${c.packCount === 1 ? '' : 's'}` : '', `${c.assets} asset${c.assets === 1 ? '' : 's'}`].filter(Boolean).join(' · ')} />
          </MenuItem>
        ))}
      </Menu>

    </>
  );
}

/** Save the current search as a smart collection. */
export function SaveSearchDialog({ open, onClose, query, suggested }: { open: boolean; onClose: () => void; query: SmartQuery; suggested: string }) {
  return (
    <NameDialog
      open={open}
      title="Save as a smart collection"
      initial={suggested}
      action="Save"
      onClose={onClose}
      onDone={async (name, description) => {
        onClose();
        await newCollection(name, { query, description });
      }}
    />
  );
}
