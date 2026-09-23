import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { create } from 'zustand';
import { hasRules, NO_RULES, type CollectionItem, type CollectionRules } from '@shared/collection';
import { LICENCES, licenceInfo } from '@shared/licences';
import { call } from '../../api';
import { newCollection } from '../../state/collections';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useProjects } from '../../state/projects';
import { md, SHAPE } from '../../theme';

export interface CollectionDraft {
  name: string;
  description: string;
  rules: CollectionRules;
  projectId: string | null;
}

/** Words already used in the library for a field, so a rule is chosen rather than typed. */
function useTerms(field: 'style' | 'tag' | 'creator') {
  const lib = useLibraryId();
  const version = useIndexVersion();
  return useQuery({ queryKey: ['terms', lib, version, field], queryFn: () => call('library:terms', field), enabled: !!lib }).data ?? [];
}

function Rule({ label, note, options, value, onChange, labelOf }: { label: string; note: string; options: string[]; value: string[]; onChange: (v: string[]) => void; labelOf?: (v: string) => string }) {
  return (
    <Autocomplete
      multiple
      freeSolo
      size="small"
      options={options}
      value={value}
      onChange={(_, v) => onChange(v as string[])}
      getOptionLabel={(o) => labelOf?.(o as string) ?? (o as string)}
      renderValue={(values, getProps) => values.map((v, i) => <Chip {...getProps({ index: i })} key={v as string} size="small" label={labelOf?.(v as string) ?? (v as string)} />)}
      renderInput={(p) => <TextField {...p} label={label} placeholder={note} />}
    />
  );
}

/**
 * Making or editing a collection: what it is called, the game it is for, and what it will take.
 * The rules are the point: a collection for one game's licence should refuse anything else, so a
 * mistake is caught as it is made rather than at the end of the project.
 */
export function CollectionDialog({
  open,
  title,
  action,
  initial,
  onClose,
  onDone,
}: {
  open: boolean;
  title: string;
  action: string;
  initial?: Partial<CollectionDraft>;
  onClose: () => void;
  onDone: (draft: CollectionDraft) => void;
}) {
  const projects = useProjects().data ?? [];
  const styles = useTerms('style');
  const tags = useTerms('tag');
  const creators = useTerms('creator');
  const [draft, setDraft] = useState<CollectionDraft>({ name: initial?.name ?? '', description: initial?.description ?? '', rules: initial?.rules ?? NO_RULES, projectId: initial?.projectId ?? null });
  const [showRules, setShowRules] = useState(hasRules(initial?.rules));
  const set = (patch: Partial<CollectionDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const rule = (patch: Partial<CollectionRules>) => setDraft((d) => ({ ...d, rules: { ...d.rules, ...patch } }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        transition: {
          onEnter: () => {
            setDraft({ name: initial?.name ?? '', description: initial?.description ?? '', rules: initial?.rules ?? NO_RULES, projectId: initial?.projectId ?? null });
            setShowRules(hasRules(initial?.rules));
          },
        },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField autoFocus label="Name" value={draft.name} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && draft.name.trim() && onDone({ ...draft, name: draft.name.trim() })} sx={{ mt: 1 }} />
        <TextField label="What it is for (optional)" value={draft.description} onChange={(e) => set({ description: e.target.value })} multiline minRows={2} />
        <TextField select label="The game it is for" value={draft.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || null })} helperText="Its assets can then be copied there in one go.">
          <MenuItem value="">No game in particular</MenuItem>
          {projects.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>

        <div style={{ padding: 12, borderRadius: SHAPE.md, background: md('surfaceContainerLow') }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AutoAwesomeOutlined sx={{ fontSize: 18, color: md('tertiary') }} />
            <Typography variant="titleSmall" sx={{ flex: 1, color: md('onSurface') }}>
              Only take things that fit
            </Typography>
            <Button size="small" onClick={() => (showRules ? (rule(NO_RULES), setShowRules(false)) : setShowRules(true))}>
              {showRules ? 'No rules' : 'Set rules'}
            </Button>
          </div>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
            Anything that does not fit is turned away as it is added, and says why. Leave a line empty and it is not fussy about that.
          </Typography>
          {showRules && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <Rule
                label="Licence"
                note="CC0, CC BY 4.0…"
                options={LICENCES.map((l) => l.id)}
                labelOf={(id) => licenceInfo(id)?.short ?? id}
                value={draft.rules.licences}
                onChange={(licences) => rule({ licences })}
              />
              <Rule label="Creator" note="Kenney…" options={creators.map((t) => t.value)} value={draft.rules.creators} onChange={(creators) => rule({ creators })} />
              <Rule label="Style" note="Low poly, pixel…" options={styles.map((t) => t.value)} value={draft.rules.styles} onChange={(styles) => rule({ styles })} />
              <Rule label="Tags" note="forest, ui…" options={tags.map((t) => t.value)} value={draft.rules.tags} onChange={(tags) => rule({ tags })} />
            </div>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!draft.name.trim()} onClick={() => onDone({ ...draft, name: draft.name.trim() })}>
          {action}
        </Button>
      </DialogActions>
    </Dialog>
  );
}


interface Pending {
  items: CollectionItem[];
  packs: string[];
}

interface NewCollectionState {
  pending: Pending | null;
  start(items: CollectionItem[], packs: string[]): void;
  close(): void;
}

/**
 * "New collection…" is offered inside menus that close the moment it is chosen, so the dialog
 * belongs to the app rather than to the menu: it opens here and outlives whatever started it.
 */
export const useNewCollection = create<NewCollectionState>((set) => ({
  pending: null,
  start: (items, packs) => set({ pending: { items, packs } }),
  close: () => set({ pending: null }),
}));

/** Ask what the new collection should be, then make it with the things that were being added. */
export function NewCollectionHost() {
  const pending = useNewCollection((s) => s.pending);
  const close = useNewCollection((s) => s.close);
  if (!pending) return null;
  return (
    <CollectionDialog
      open
      title="New collection"
      action="Create"
      onClose={close}
      onDone={async (draft) => {
        close();
        await newCollection(draft.name, { items: pending.items, packs: pending.packs, description: draft.description, rules: draft.rules, projectId: draft.projectId });
      }}
    />
  );
}
