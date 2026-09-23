import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import StarOutlineRounded from '@mui/icons-material/StarOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';

/**
 * One icon per thing, used everywhere. A collection is always this icon, a game always that one:
 * a picture that changes from page to page has to be learned twice.
 */
export const CollectionIcon = CollectionsBookmarkOutlined;
export const ProjectIcon = SportsEsportsOutlined;
export const PackIcon = Inventory2Outlined;
export const ReviewIcon = RateReviewOutlined;
export const ArchiveIcon = ArchiveOutlined;
export const DownloadIcon = DownloadOutlined;
export const FolderIcon = FolderOpenOutlined;
export const EditIcon = EditOutlined;
export const DeleteIcon = DeleteOutlineRounded;
/** Linking an asset to a game copies its files in; one icon for the whole idea. */
export const LinkToGameIcon = DriveFileMoveOutlined;
export const StarOnIcon = StarRounded;
export const StarOffIcon = StarOutlineRounded;
