import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined';
import FolderCopyOutlined from '@mui/icons-material/FolderCopyOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useImport } from '../state/importer';

/** The rail's Add button: pick downloads, one folder, or a folder full of packs. */
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
        <ListItemText primary="Add downloads…" secondary="Zips or files; each zip is a pack" />
      </MenuItem>
      <MenuItem onClick={() => pick('folder')}>
        <ListItemIcon>
          <CreateNewFolderOutlined />
        </ListItemIcon>
        <ListItemText primary="Add a folder…" secondary="The folder becomes one pack" />
      </MenuItem>
      <MenuItem onClick={() => pick('folderOfPacks')}>
        <ListItemIcon>
          <FolderCopyOutlined />
        </ListItemIcon>
        <ListItemText primary="Add a folder of packs…" secondary="Every zip and folder inside is a pack" />
      </MenuItem>
    </Menu>
  );
}
