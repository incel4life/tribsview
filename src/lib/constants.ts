export const DB_NAME = 'bops34DB';
export const DB_VERSION = 3;

export const APP_VERSION = '2.0.0';

export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export const VALID_VIDEO_TYPES = Object.freeze([
	'video/mp4',
	'video/webm',
	'video/ogg',
	'video/quicktime',
	'video/x-msvideo',
	'video/x-matroska',
]);

export const THUMBNAIL_W = 160;
export const THUMBNAIL_H = 90;
export const THUMBNAIL_SEEK_TIME = 0.5;
export const THUMBNAIL_QUALITY = 0.72;

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.05;
export const ZOOM_SCROLL_STEP = 0.1;
export const ZOOM_ROUND_FACTOR = 20;

export const POPUP_DEFAULT_WIDTH = 270;
export const POPUP_MARGIN = 10;
export const POPUP_MIN_W = 220;
export const POPUP_MIN_H = 180;

export const REPEAT_MODES = Object.freeze(['All', 'One', 'None'] as const);

export const SAVE_DEBOUNCE_MS = 400;

export const SUPPORTED_VIDEO_EXTENSIONS = Object.freeze([
	'.mp4',
	'.webm',
	'.ogg',
	'.ogv',
	'.mov',
	'.mkv',
	'.avi',
	'.m4v',
	'.3gp',
]);

export const EXPORT_VERSION = '4.0.0';

export const LITTERBOX_API = 'https://litterbox.catbox.moe/resources/internals/api.php';
export const CATBOX_API = 'https://catbox.moe/user/api.php';
export const LITTERBOX_DEFAULT_TTL = '24h';
export const DEFAULT_UPLOAD_SERVICE = 'litterbox';
