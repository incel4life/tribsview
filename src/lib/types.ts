export interface QueueItem {
	url: string | null;
	name: string;
	filepath?: string;
	duration: number;
	thumbnail?: string;
	blobId?: string;
	source: 'file' | 'url';
	mediaRef?: string;
	via?: string;
	zoom?: number;
	zoomX?: number;
	zoomY?: number;
}

export interface TileSettings {
	repeat: 'All' | 'One' | 'None';
	shuffle: boolean;
	zoom: number;
	zoomX: number;
	zoomY: number;
}

export interface Tile {
	id: string;
	order: number;
	queue: QueueItem[];
	settings: TileSettings;
	_showQueue: boolean;
	_zoomHover: { x: number; y: number } | null;
	_urlInput: string;
	_urlResolving: boolean;
	_urlCobaltStatus: string | null;
	_videoWarning: string | null;
	_videoWidth: number;
	_videoHeight: number;
	_currentIndex: number;
}

export interface Collection {
	id: string;
	name: string;
	tiles: Tile[];
}

export interface Popup {
	id: string;
	tileId: string;
	type: 'zoom' | 'controls' | 'queue';
	x: number;
	y: number;
	width: number;
	height: number | null;
}

export interface ContextMenu {
	visible: boolean;
	x: number;
	y: number;
	tileId: string | null;
	tile: Tile | null;
}

export interface CollPanel {
	renamingId: string | null;
	renameVal: string;
	confirmId: string | null;
	showNew: boolean;
	newName: string;
}

export interface ImportPanel {
	show: boolean;
	parsedData: ImportData | null;
	mode: 'replace' | 'merge';
	error: string | null;
	info: ImportInfo | null;
}

export interface ImportInfo {
	version: string;
	totalCollections: number;
	totalTiles: number;
	hasMediaMap: boolean;
}

export interface ImportData {
	version: string;
	collections: Array<{
		id: string;
		name: string;
		tiles?: Tile[];
		scenes?: Array<{ id: string; name: string; tiles: Tile[] }>;
	}>;
	media?: Record<string, MediaEntry>;
	currentCollectionId?: string;
}

export interface MediaEntry {
	url: string | null;
	name: string;
	source: string;
	hosted: boolean;
	error?: string;
	uploadService?: string;
	hostedAt?: string;
	originalBlobId?: string;
	duration?: number;
	thumbnail?: string;
}

export interface ExportPanel {
	show: boolean;
	service: 'litterbox' | 'catbox';
	ttl: string;
	uploading: boolean;
	progress: { current: number; total: number };
	error: string | null;
	done: boolean;
}

declare global {
	interface Window {
		electronAPI?: {
			platform: string;
			isDev: boolean;
			isElectron: boolean;
			minimizeWindow: () => void;
			maximizeWindow: () => void;
			closeWindow: () => void;
			onMaximizeChange: (callback: (isMaximized: boolean) => void) => void;
		};
	}
}