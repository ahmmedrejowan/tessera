import AddOutlined from '@mui/icons-material/AddOutlined';
import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
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
 * "Add to collection": the manual collections, newest first, and a new one. `items` is asked for
 * when a choice is made, so a large selection is only resolved if it's needed.
 */
export function CollectionMenu({ anchor, onClose, items }: { anchor: HTMLElement | null; onClose: () => void; items: () => Promise<CollectionItem[]> }) {
  const collections = (useCollections().data ?? []).filter((c) => c.kind === 'manual').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [naming, setNaming] = useState(false);
  return (
    <>
      <Menu anchorEl={anchor} open={!!anchor} onClose={onClose} slotProps={{ paper: { sx: { minWidth: 260, maxHeight: 420 } } }}>
        <MenuItem
          onClick={() => {
            onClose();
            setNaming(true);
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
              await addToCollection(c.id, c.name, await items());
            }}
          >
            <ListItemIcon>
              <CollectionsBookmarkOutlined />
            </ListItemIcon>
            <ListItemText primary={c.name} secondary={`${c.count} asset${c.count === 1 ? '' : 's'}`} />
          </MenuItem>
        ))}
      </Menu>
      <NameDialog
        open={naming}
        title="New collection"
        action="Create"
        onClose={() => setNaming(false)}
        onDone={async (name, description) => {
          setNaming(false);
          await newCollection(name, { items: await items(), description });
        }}
      />
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
