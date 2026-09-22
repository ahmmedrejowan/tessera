import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useImport } from '../state/importer';

/** The rail's Add button: pick downloads or a folder; the add page takes it from there. */
export function AddMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const choose = useImport((s) => s.choose);
  const pick = (what: 'files' | 'folder' | 'folderOfPacks') => {
    onClose();
    void choose(what);
  };
  return (
    <Menu anchorEl={anchor} open={!!anchor} onClose={onClose} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { minWidth: 300 } } }}>
      <MenuItem onClick={() => pick('files')}>
        <ListItemIcon>
          <UploadFileOutlined />
        </ListItemIcon>
        <ListItemText primary="Choose files…" secondary="Zips or files you downloaded" />
      </MenuItem>
      <MenuItem onClick={() => pick('folder')}>
        <ListItemIcon>
          <CreateNewFolderOutlined />
        </ListItemIcon>
        <ListItemText primary="Choose a folder…" secondary="One pack, or a folder of downloads" />
      </MenuItem>
    </Menu>
  );
}
