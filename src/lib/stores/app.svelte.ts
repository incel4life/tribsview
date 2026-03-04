import type { Collection, Tile, Popup, ContextMenu, CollPanel, ImportPanel, ExportPanel, QueueItem, ImportData } from '$lib/types';
import { generateId } from '$lib/utils/id';
import { resetTransientTileState, scheduleAutoSave, initDB, loadFromDB, saveBlobToDB, getBlobFromDB, deleteBlobFromDB, clearDB } from '$lib/db';
import { validateVideoUrl, UrlStatus, generateThumbnail, getAspectRatioWarning, extractUrlMetadata } from '$lib/utils/video';
import { buildProjectExport } from '$lib/utils/export';
import { VALID_VIDEO_TYPES, MAX_FILE_SIZE_BYTES, REPEAT_MODES, ZOOM_MIN, ZOOM_MAX, ZOOM_SCROLL_STEP, ZOOM_ROUND_FACTOR, POPUP_DEFAULT_WIDTH, POPUP_MARGIN, POPUP_MIN_W, POPUP_MIN_H, APP_VERSION, EXPORT_VERSION } from '$lib/constants';

function createAppState() {
	let tiles = $state<Tile[]>([]);
	let isPlay = $state(false);
	let isFS = $state(false);
	let lock = $state(false);
	let selectedID = $state<string | null>(null);
	let dragID = $state<string | null>(null);
	let showKeyboard = $state(false);
	let isDesktop = $state(false);
	let collections = $state<Collection[]>([]);
	let currentCollectionId = $state<string | null>(null);
	let showCollectionsPanel = $state(false);
	let popups = $state<Popup[]>([]);
	let contextMenu = $state<ContextMenu>({ visible: false, x: 0, y: 0, tileId: null, tile: null });

	let collPanel = $state<CollPanel>({
		renamingId: null,
		renameVal: '',
		confirmId: null,
		showNew: false,
		newName: '',
	});

	let importPanel = $state<ImportPanel>({
		show: false,
		parsedData: null,
		mode: 'replace',
		error: null,
		info: null,
	});

	let exportPanel = $state<ExportPanel>({
		show: false,
		service: 'litterbox',
		ttl: '24h',
		uploading: false,
		progress: { current: 0, total: 0 },
		error: null,
		done: false,
	});

	function autoSave() {
		scheduleAutoSave(collections, currentCollectionId);
	}

	function getCurrentCollection(): Collection | undefined {
		return collections.find((c) => c.id === currentCollectionId);
	}

	function createNewTile(order = 0): Tile {
		return {
			id: generateId(),
			order,
			queue: [],
			settings: { repeat: 'All', shuffle: false, zoom: 1.0, zoomX: 50, zoomY: 50 },
			_showQueue: false,
			_zoomHover: null,
			_urlInput: '',
			_urlResolving: false,
			_urlCobaltStatus: null,
			_videoWarning: null,
			_videoWidth: 0,
			_videoHeight: 0,
			_currentIndex: 0,
		};
	}

	function loadCurrentCollectionTiles() {
		const col = getCurrentCollection();
		if (!col) return;
		popups = [];
		tiles = (col.tiles || []).map((tile) => resetTransientTileState({ ...tile }));
	}

	async function init() {
		try {
			await initDB();
		} catch (err) {
			console.error('[app] IndexedDB failed:', err);
		}

		try {
			const saved = await loadFromDB();
			if (saved) {
				collections = saved.collections;
				currentCollectionId = saved.currentCollectionId;
			}
		} catch (err) {
			console.error('[app] Load from DB failed:', err);
		}

		if (collections.length === 0) {
			const col: Collection = {
				id: generateId(),
				name: 'Default Collection',
				tiles: Array.from({ length: 3 }, (_, i) => createNewTile(i)),
			};
			collections.push(col);
			currentCollectionId = col.id;
		}

		if (!currentCollectionId || !collections.find((c) => c.id === currentCollectionId)) {
			currentCollectionId = collections[0]?.id ?? null;
		}

		loadCurrentCollectionTiles();

		document.addEventListener('fullscreenchange', () => {
			if (!document.fullscreenElement) {
				isFS = false;
				isPlay = false;
			}
		});

		document.addEventListener('click', () => {
			if (contextMenu.visible) closeContextMenu();
		});

		isDesktop = window.matchMedia('(pointer: fine)').matches && !('ontouchstart' in window);
	}

	function syncAllVideos() {
		setTimeout(() => {
			document.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
				video.currentTime = 0;
				if (isPlay) {
					video.play().catch((e) => console.error('[video] Play error:', e));
				} else {
					video.pause();
				}
			});
		}, 0);
	}

	function togglePlay() {
		isPlay = !isPlay;
		// if (isPlay && !isFS) enterFullscreen(); INTENDED DO NOT UNCOMMENT, JUST IN CASE
		syncAllVideos();
	}

	function toggleFullscreen() {
		if (isFS) exitFullscreen();
		else enterFullscreen();
	}

	function enterFullscreen() {
		const container = document.getElementById('fullscreen-container');
		if (!container) return;
		const requestFS = (container as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).requestFullscreen ?? (container as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
		if (typeof requestFS === 'function') {
			requestFS.call(container).catch((e: Error) => console.error('[video] Fullscreen failed:', e));
		}
		isFS = true;
		isPlay = true;
		syncAllVideos();
	}

	function exitFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => { });
		}
		isFS = false;
		isPlay = false;
	}

	function toggleLock() {
		lock = !lock;
	}

	function addTile() {
		const col = getCurrentCollection();
		if (!col) return;
		if (!Array.isArray(col.tiles)) col.tiles = [];
		col.tiles.push(createNewTile(col.tiles.length));
		loadCurrentCollectionTiles();
		autoSave();
	}

	function removeTile(id: string) {
		const col = getCurrentCollection();
		if (!col || !Array.isArray(col.tiles) || col.tiles.length <= 1) return;
		col.tiles = col.tiles.filter((t) => t.id !== id);
		popups = popups.filter((p) => p.tileId !== id);
		loadCurrentCollectionTiles();
		autoSave();
	}

	function selectTile(id: string) {
		selectedID = id;
	}

	function moveTileLeft(index: number) {
		if (index <= 0) return;
		const col = getCurrentCollection();
		if (!col || !Array.isArray(col.tiles)) return;
		[col.tiles[index - 1], col.tiles[index]] = [col.tiles[index], col.tiles[index - 1]];
		loadCurrentCollectionTiles();
		autoSave();
	}

	function moveTileRight(index: number) {
		const col = getCurrentCollection();
		if (!col || !Array.isArray(col.tiles)) return;
		if (index >= col.tiles.length - 1) return;
		[col.tiles[index], col.tiles[index + 1]] = [col.tiles[index + 1], col.tiles[index]];
		loadCurrentCollectionTiles();
		autoSave();
	}

	function openPopup(tile: Tile, type: 'zoom' | 'controls' | 'queue', anchorRect: DOMRect) {
		const existingIdx = popups.findIndex((p) => p.tileId === tile.id && p.type === type);
		if (existingIdx !== -1) {
			popups.splice(existingIdx, 1);
			return;
		}
		const vw = window.innerWidth;
		let x = anchorRect.right + POPUP_MARGIN;
		if (x + POPUP_DEFAULT_WIDTH > vw - 8) x = anchorRect.left - POPUP_DEFAULT_WIDTH - POPUP_MARGIN;
		x = Math.max(8, x);
		const stackOffset = popups.filter((p) => p.tileId === tile.id).length * 24;
		const y = Math.max(8, anchorRect.top + stackOffset);
		popups.push({ id: generateId(), tileId: tile.id, type, x, y, width: POPUP_DEFAULT_WIDTH, height: null });
	}

	function closePopup(popupId: string) {
		popups = popups.filter((p) => p.id !== popupId);
	}

	function hasPopup(tileId: string, type: string): boolean {
		return popups.some((p) => p.tileId === tileId && p.type === type);
	}

	function getPopupPositionStyle(popup: Popup): string {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const w = popup.width ?? POPUP_DEFAULT_WIDTH;
		const x = Math.max(8, Math.min(vw - w - 8, popup.x));
		const y = Math.max(8, Math.min(vh - 60, popup.y));
		const maxH = vh - y - 12;
		const heightPart = popup.height != null ? `height: ${Math.round(popup.height)}px;` : `max-height: ${Math.max(200, Math.round(maxH))}px;`;
		return `position: fixed; left: ${Math.round(x)}px; top: ${Math.round(y)}px; width: ${Math.round(w)}px; ${heightPart} z-index: 1000;`;
	}

	function startPopupDrag(popup: Popup, event: MouseEvent) {
		event.preventDefault();
		const startMouseX = event.clientX, startMouseY = event.clientY;
		const startX = popup.x, startY = popup.y;
		document.body.style.cursor = 'grabbing';
		document.body.style.userSelect = 'none';
		const onMove = (e: MouseEvent) => {
			popup.x = startX + (e.clientX - startMouseX);
			popup.y = startY + (e.clientY - startMouseY);
		};
		const onUp = () => {
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}

	function startPopupResize(popup: Popup, event: MouseEvent, el: HTMLElement | null) {
		event.preventDefault();
		const rect = el?.getBoundingClientRect();
		const startMouseX = event.clientX, startMouseY = event.clientY;
		const startW = rect ? rect.width : (popup.width ?? POPUP_DEFAULT_WIDTH);
		const startH = rect ? rect.height : (popup.height ?? 400);
		document.body.style.cursor = 'se-resize';
		document.body.style.userSelect = 'none';
		const onMove = (e: MouseEvent) => {
			popup.width = Math.max(POPUP_MIN_W, startW + (e.clientX - startMouseX));
			popup.height = Math.max(POPUP_MIN_H, startH + (e.clientY - startMouseY));
		};
		const onUp = () => {
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}

	function getCurrentItem(tile: Tile) {
		return tile.queue[tile._currentIndex] ?? null;
	}

	function setZoom(tile: Tile, value: string | number) {
		const item = getCurrentItem(tile);
		if (!item) return;
		item.zoom = parseFloat(String(value));
		autoSave();
	}

	function resetZoom(tile: Tile) {
		const item = getCurrentItem(tile);
		if (!item) return;
		item.zoom = 1.0;
		item.zoomX = 50;
		item.zoomY = 50;
		autoSave();
	}

	function applyZoomPercent(tile: Tile, value: string) {
		const val = parseFloat(value);
		if (isNaN(val)) return;
		const item = getCurrentItem(tile);
		if (!item) return;
		item.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, val / 100));
		autoSave();
	}

	function handleZoomScroll(tile: Tile, event: WheelEvent) {
		const item = getCurrentItem(tile);
		if (!item) return;
		const dir = event.deltaY < 0 ? 1 : -1;
		const raw = (item.zoom ?? 1) + dir * ZOOM_SCROLL_STEP;
		item.zoom = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, raw)) * ZOOM_ROUND_FACTOR) / ZOOM_ROUND_FACTOR;
		autoSave();
	}

	function setZoomOrigin(tile: Tile, event: MouseEvent | null, explicitX?: number, explicitY?: number) {
		const item = getCurrentItem(tile);
		if (!item) return;
		if (event === null && explicitX !== undefined) {
			item.zoomX = Math.max(0, Math.min(100, explicitX));
			item.zoomY = Math.max(0, Math.min(100, explicitY ?? 50));
			autoSave();
			return;
		}
		if (!event) return;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		item.zoomX = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
		item.zoomY = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
		autoSave();
	}

	function getZoomViewportStyle(tile: Tile): string {
		const item = getCurrentItem(tile);
		const z = item?.zoom ?? 1;
		if (z <= 1) return 'display: none;';
		const w = 100 / z, h = 100 / z;
		const cx = item?.zoomX ?? 50, cy = item?.zoomY ?? 50;
		const left = Math.max(0, Math.min(100 - w, cx - w / 2));
		const top = Math.max(0, Math.min(100 - h, cy - h / 2));
		return `left: ${left}%; top: ${top}%; width: ${w}%; height: ${h}%;`;
	}

	function handleDragStart(event: DragEvent, id: string) {
		if (isFS || lock) { event.preventDefault(); return; }
		dragID = id;
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(event: DragEvent) {
		if (isFS || lock) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function handleDrop(event: DragEvent, targetId: string) {
		event.preventDefault();
		if (isFS || lock) return;
		const files = Array.from(event.dataTransfer?.files ?? []);
		if (files.length > 0) {
			const tile = tiles.find((t) => t.id === targetId);
			if (tile) processDroppedFiles(files, tile);
		} else {
			handleTileReorder(targetId);
		}
	}

	function handleTileReorder(targetId: string) {
		if (!dragID || dragID === targetId) { dragID = null; return; }
		const col = getCurrentCollection();
		if (!col || !Array.isArray(col.tiles)) return;
		const fromIdx = col.tiles.findIndex((t) => t.id === dragID);
		const toIdx = col.tiles.findIndex((t) => t.id === targetId);
		if (fromIdx === -1 || toIdx === -1) { dragID = null; return; }
		const arr = [...col.tiles];
		const [dragged] = arr.splice(fromIdx, 1);
		arr.splice(toIdx, 0, dragged);
		col.tiles = arr;
		loadCurrentCollectionTiles();
		dragID = null;
		autoSave();
	}

	function handleContextMenu(tile: Tile, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		selectTile(tile.id);
		const menuWidth = 180, menuHeight = 140;
		let x = event.clientX, y = event.clientY;
		if (x + menuWidth > window.innerWidth - 8) x = window.innerWidth - menuWidth - 8;
		if (y + menuHeight > window.innerHeight - 8) y = window.innerHeight - menuHeight - 8;
		contextMenu = { visible: true, x, y, tileId: tile.id, tile };
	}

	function closeContextMenu() {
		contextMenu = { ...contextMenu, visible: false, tileId: null, tile: null };
	}

	function handleContextMenuAction(action: string) {
		const tile = tiles.find((t) => t.id === contextMenu.tileId);
		if (!tile) { closeContextMenu(); return; }
		if (action === 'delete') {
			removeTile(tile.id);
		} else if (action === 'settings' || action === 'zoom' || action === 'queue') {
			const mockRect = new DOMRect(contextMenu.x, contextMenu.y, 180, 100);
			const type = action === 'zoom' ? 'zoom' : action === 'queue' ? 'queue' : 'controls';
			openPopup(tile, type, mockRect);
		}
		closeContextMenu();
	}

	function cycleRepeat(tile: Tile) {
		if (lock) return;
		const idx = REPEAT_MODES.indexOf(tile.settings.repeat as typeof REPEAT_MODES[number]);
		tile.settings.repeat = REPEAT_MODES[(idx + 1) % REPEAT_MODES.length];
		autoSave();
	}

	function toggleShuffleSelected() {
		if (lock) return;
		const tile = tiles.find((t) => t.id === selectedID);
		if (tile) { tile.settings.shuffle = !tile.settings.shuffle; autoSave(); }
	}

	function cycleRepeatSelected() {
		if (lock) return;
		const tile = tiles.find((t) => t.id === selectedID);
		if (tile) cycleRepeat(tile);
	}

	async function processDroppedFiles(files: File[], tile: Tile) {
		const videoFiles = files.filter((f) => VALID_VIDEO_TYPES.includes(f.type));
		for (const file of videoFiles) {
			if (file.size > MAX_FILE_SIZE_BYTES) continue;
			await processVideoFile(file, tile);
		}
	}

	async function handleFileUpload(files: FileList | null, tile: Tile) {
		if (!files) return;
		for (const file of Array.from(files)) {
			if (!VALID_VIDEO_TYPES.includes(file.type)) continue;
			if (file.size > MAX_FILE_SIZE_BYTES) continue;
			await processVideoFile(file, tile);
		}
	}

	async function processVideoFile(file: File, tile: Tile) {
		const url = URL.createObjectURL(file);
		let blobId: string | null = null;
		try {
			await new Promise<void>((resolve, reject) => {
				const video = document.createElement('video');
				video.preload = 'metadata';
				video.src = url;
				video.onloadedmetadata = () => resolve();
				video.onerror = () => reject(new Error(`Failed to decode: ${file.name}`));
			});

			blobId = generateId();
			await saveBlobToDB(blobId, file);
			URL.revokeObjectURL(url);
			const blob = await getBlobFromDB(blobId);
			const persistentUrl = blob ? URL.createObjectURL(blob) : url;

			const video = document.createElement('video');
			video.preload = 'metadata';
			video.src = persistentUrl;

			await new Promise<void>((resolve) => {
				video.onloadedmetadata = async () => {
					const thumbnail = await generateThumbnail(video);
					tile.queue.push({ url: persistentUrl, name: file.name, filepath: file.webkitRelativePath || file.name, duration: video.duration, thumbnail, blobId: blobId!, source: 'file' });
					autoSave();
					resolve();
				};
				video.onerror = () => {
					if (blobId) deleteBlobFromDB(blobId).catch(() => { });
					URL.revokeObjectURL(persistentUrl);
					resolve();
				};
			});
		} catch (err) {
			URL.revokeObjectURL(url);
			if (blobId) await deleteBlobFromDB(blobId).catch(() => { });
			console.error('[video] processVideoFile error:', (err as Error).message);
		}
	}

	// ── yt-dlp: detect platform URLs ─────────────────────────────────────────
	// Direct .mp4/.webm/etc. → original path. Known platforms → yt-dlp.
	function isYtDlpUrl(url: string): boolean {
		if (/\.(mp4|webm|ogg|mov|mkv|avi|flv|wmv|m4v)(\?.*)?$/i.test(url)) return false;
		return [
			/youtube\.com\/watch/i,
			/youtu\.be\//i,
			/youtube\.com\/shorts\//i,
			/vimeo\.com\//i,
			/twitter\.com\/.*\/status\//i,
			/x\.com\/.*\/status\//i,
			/tiktok\.com\//i,
			/instagram\.com\/(p|reel|tv)\//i,
			/twitch\.tv\/.*\/clip\//i,
			/clips\.twitch\.tv\//i,
			/reddit\.com\/r\/.*\/comments\//i,
			/dailymotion\.com\/video\//i,
			/streamable\.com\//i,
			/nicovideo\.jp\/watch\//i,
			/bilibili\.com\/video\//i,
		].some((re) => re.test(url));
	}

	// ── yt-dlp: download via Electron IPC → IndexedDB ────────────────────────
	async function addUrlViaYtDlp(tile: Tile, rawUrl: string): Promise<void> {
		const electronAPI = (window as any).electronAPI;
		if (!electronAPI?.ytdlpDownload) {
			tile._videoWarning = 'Tiktok, Instagram, X, etc... URLs only supported in the desktop app.';
			return;
		}

		tile._urlResolving = true;
		tile._urlCobaltStatus = 'Fetching info…';
		tile._videoWarning = null;

		// Subscribe to real-time progress events from the main process.
		// electronAPI.onYtdlpProgress must be exposed by the preload script as:
		//   ipcRenderer.on('ytdlp:progress', (_e, data) => callback(data))
		// and return an unsubscribe function that calls ipcRenderer.removeListener.
		let unsubscribeProgress: (() => void) | null = null;
		if (typeof electronAPI.onYtdlpProgress === 'function') {
			unsubscribeProgress = electronAPI.onYtdlpProgress(
				(data: { percentage: string; status: string }) => {
					tile._urlCobaltStatus = data.status ?? `Downloading… ${data.percentage}`;
				}
			);
		}

		let blobId: string | null = null;
		try {
			// 1. Main process downloads the video to a temp file, reads its bytes,
			//    deletes the temp file, and returns the raw buffer + metadata.
			const result: {
				buffer: Uint8Array;
				filename: string;
				mimeType: string;
				title: string;
				duration: number | null;
				thumbnail: string | null;
			} = await electronAPI.ytdlpDownload(rawUrl);

			tile._urlCobaltStatus = 'Processing video…';

			// 2. IPC may deserialise the Uint8Array into a plain object; normalise it
			//    back to a Uint8Array backed by a real ArrayBuffer before passing to File.
			const safeBuffer = result.buffer instanceof Uint8Array && result.buffer.buffer instanceof ArrayBuffer
				? result.buffer
				: new Uint8Array(Object.values(result.buffer as unknown as Record<string, number>));
			const file = new File([safeBuffer.buffer as ArrayBuffer], result.filename, { type: result.mimeType });

			// 3. Verify the browser can decode the video before persisting.
			const checkUrl = URL.createObjectURL(file);
			await new Promise<void>((resolve, reject) => {
				const v = document.createElement('video');
				v.preload = 'metadata';
				v.src = checkUrl;
				v.onloadedmetadata = () => { URL.revokeObjectURL(checkUrl); resolve(); };
				v.onerror = () => { URL.revokeObjectURL(checkUrl); reject(new Error('Browser cannot decode the downloaded video.')); };
			});

			// 4. Persist to IndexedDB — same path as a local file upload.
			tile._urlCobaltStatus = 'Saving to library…';
			blobId = generateId();
			await saveBlobToDB(blobId, file);
			const storedBlob = await getBlobFromDB(blobId);
			const persistentUrl = storedBlob ? URL.createObjectURL(storedBlob) : URL.createObjectURL(file);

			// 5. Thumbnail — prefer the one from yt-dlp (remote URL is fine here),
			//    fall back to canvas grab from the stored video.
			let thumbnail: string | undefined;
			if (result.thumbnail) {
				thumbnail = result.thumbnail;
			} else {
				const tv = document.createElement('video');
				tv.preload = 'metadata';
				tv.src = persistentUrl;
				const grabbed = await new Promise<string | null>((resolve) => {
					tv.onloadedmetadata = async () => resolve(await generateThumbnail(tv));
					tv.onerror = () => resolve(null);
				});
				thumbnail = grabbed ?? undefined;
			}

			// 6. Duration — from yt-dlp metadata (seconds), or read from the element.
			let duration: number = typeof result.duration === 'number' ? result.duration : 0;
			if (!duration) {
				const dv = document.createElement('video');
				dv.preload = 'metadata';
				dv.src = persistentUrl;
				duration = await new Promise<number>((resolve) => {
					dv.onloadedmetadata = () => resolve(dv.duration || 0);
					dv.onerror = () => resolve(0);
				});
			}

			// 7. Push into the queue — stored in IndexedDB, plays like a local file.
			tile.queue.push({
				url: persistentUrl,
				name: result.title || result.filename,
				filepath: rawUrl,          // original platform URL for reference
				duration,
				thumbnail,
				blobId: blobId!,
				source: 'file',
			});

			// 8. If this is the only item, make sure the video element picks it up and plays.
			if (tile.queue.length === 1) {
				tile._currentIndex = 0;
				setTimeout(() => {
					document.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
						if (v.src === persistentUrl && isPlay) {
							v.currentTime = 0;
							v.play().catch(() => { });
						}
					});
				}, 0);
			}

			tile._urlInput = '';
			tile._videoWarning = null;
			autoSave();
		} catch (err) {
			if (blobId) await deleteBlobFromDB(blobId).catch(() => { });
			tile._videoWarning = `Download failed: ${(err as Error).message}`;
			console.error('[ytdlp] download error:', err);
		} finally {
			unsubscribeProgress?.();
			tile._urlResolving = false;
			tile._urlCobaltStatus = null;
		}
	}

	async function addUrlToTile(tile: Tile) {
		const rawUrl = tile._urlInput.trim();
		if (!rawUrl) return;

		// Platform URL → download via yt-dlp in the Electron main process
		if (isYtDlpUrl(rawUrl)) {
			await addUrlViaYtDlp(tile, rawUrl);
			return;
		}

		// Plain video URL → original direct-load path (unchanged)
		const validation = validateVideoUrl(rawUrl);
		if (validation.status !== UrlStatus.VALID) {
			tile._videoWarning = validation.message ?? 'Invalid video URL';
			return;
		}
		tile._videoWarning = null;
		const validUrl = validation.url!;
		const metadata = extractUrlMetadata(validUrl);
		const sourceName = metadata?.filename || 'Video';

		const video = document.createElement('video');
		video.crossOrigin = 'anonymous';
		video.preload = 'metadata';
		video.src = validUrl;
		video.onloadedmetadata = async () => {
			const thumbnail = await generateThumbnail(video);
			tile.queue.push({ url: validUrl, name: sourceName, filepath: validUrl, duration: video.duration, thumbnail, source: 'url' });
			tile._urlInput = '';
			tile._videoWarning = null;
			autoSave();
		};
		video.onerror = () => {
			tile._videoWarning = 'Failed to load video from that URL.';
		};
	}

	async function removeFromQueue(tile: Tile, index: number) {
		const item = tile.queue[index];
		if (item?.blobId) {
			await deleteBlobFromDB(item.blobId).catch(() => { });
			if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
		}
		tile.queue = tile.queue.filter((_, idx) => idx !== index);
		if (tile.queue.length === 0) {
			removeTile(tile.id);
		} else if (tile._currentIndex >= tile.queue.length) {
			tile._currentIndex = 0;
		}
		autoSave();
	}

	function handleVideoMetadata(event: Event, tile: Tile) {
		const video = event.target as HTMLVideoElement;
		tile._videoWidth = video.videoWidth;
		tile._videoHeight = video.videoHeight;
		tile._videoWarning = getAspectRatioWarning(video.videoWidth, video.videoHeight);
	}

	function handleVideoEnded(tile: Tile) {
		if (tile.settings.repeat === 'One') return;
		const len = tile.queue.length;
		if (len === 0) return;
		let nextIndex = tile._currentIndex;
		if (tile.settings.shuffle && len > 1) {
			do { nextIndex = Math.floor(Math.random() * len); } while (nextIndex === tile._currentIndex);
		} else {
			nextIndex = (tile._currentIndex + 1) % len;
		}
		if (nextIndex === 0 && tile._currentIndex === len - 1 && tile.settings.repeat === 'None') return;
		tile._currentIndex = nextIndex;
		setTimeout(() => {
			const currentUrl = tile.queue[tile._currentIndex]?.url;
			if (!currentUrl) return;
			document.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
				if (v.src === currentUrl && v.paused && isPlay) {
					v.currentTime = 0;
					v.play().catch(() => { });
				}
			});
		}, 0);
	}

	function createNewCollection(name: string) {
		const col: Collection = { id: generateId(), name: name.trim(), tiles: [createNewTile(0)] };
		collections.push(col);
		switchCollection(col.id);
	}

	function switchCollection(collectionId: string) {
		currentCollectionId = collectionId;
		loadCurrentCollectionTiles();
		showCollectionsPanel = false;
		collPanel.renamingId = null;
		collPanel.confirmId = null;
		setTimeout(() => {
			document.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
				v.currentTime = 0;
				if (isPlay) v.play().catch(() => { });
			});
		}, 0);
		autoSave();
	}

	function renameCollection(collectionId: string, name: string) {
		const col = collections.find((c) => c.id === collectionId);
		if (col && name) { col.name = name; autoSave(); }
	}

	function duplicateCollection(collectionId: string) {
		const col = collections.find((c) => c.id === collectionId);
		if (!col) return;
		const dup: Collection = {
			id: generateId(),
			name: `${col.name} (Copy)`,
			tiles: cloneTiles(col.tiles || []),
		};
		collections.push(dup);
		autoSave();
	}

	function deleteCollection(collectionId: string) {
		if (collections.length <= 1) return;
		collections = collections.filter((c) => c.id !== collectionId);
		if (currentCollectionId === collectionId) {
			currentCollectionId = collections[0].id;
			loadCurrentCollectionTiles();
		}
		collPanel.confirmId = null;
		autoSave();
	}

	function cloneTiles(sourceTiles: Tile[]): Tile[] {
		return sourceTiles.map((tile) => {
			const clone: Tile = JSON.parse(JSON.stringify(tile, (key, value) => {
				if (key.startsWith('_')) return undefined;
				if (key === 'url' && typeof value === 'string' && value.startsWith('blob:')) return undefined;
				return value;
			}));
			clone.id = generateId();
			return resetTransientTileState(clone);
		});
	}

	function exportToJSON() {
		const data = {
			version: APP_VERSION,
			exportedAt: new Date().toISOString(),
			collections: JSON.parse(JSON.stringify(collections, (key, value) => {
				if (key.startsWith('_')) return undefined;
				if (key === 'url' && typeof value === 'string' && value.startsWith('blob:')) return undefined;
				return value;
			})),
			currentCollectionId,
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `tribsview-export-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function importProcessFile(file: File | null) {
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const data = JSON.parse(e.target!.result as string) as ImportData;
				const validationError = validateImportData(data);
				if (validationError) {
					importPanel = { show: true, parsedData: null, mode: 'replace', error: validationError, info: null };
					return;
				}
				const totalTiles = data.collections.reduce((a, c) => a + (c.tiles?.length || 0), 0);
				const hasMediaMap = Boolean(data.media && Object.keys(data.media).length > 0);
				importPanel = {
					show: true,
					parsedData: data,
					mode: 'replace',
					error: null,
					info: { version: data.version, totalCollections: data.collections.length, totalTiles, hasMediaMap },
				};
			} catch (err) {
				importPanel = { show: true, parsedData: null, mode: 'replace', error: `Invalid JSON: ${(err as Error).message}`, info: null };
			}
		};
		reader.onerror = () => { importPanel = { ...importPanel, show: true, error: 'Failed to read file.' }; };
		reader.readAsText(file);
	}

	function importExecute() {
		const { parsedData, mode } = importPanel;
		if (!parsedData) return;
		try {
			if (parsedData.version === EXPORT_VERSION && parsedData.media) {
				restoreMediaRefs(parsedData);
			}
			const fresh = cloneCollectionsWithFreshIds(parsedData.collections);
			if (mode === 'merge') {
				collections.push(...fresh);
				if (fresh.length > 0) switchCollection(fresh[0].id);
			} else {
				collections = fresh;
				currentCollectionId = fresh[0]?.id ?? null;
				loadCurrentCollectionTiles();
			}
			autoSave();
		} catch (err) {
			importPanel = { ...importPanel, error: `Import failed: ${(err as Error).message}` };
			return;
		}
		importHidePanel();
	}

	function importHidePanel() {
		importPanel = { show: false, parsedData: null, mode: 'replace', error: null, info: null };
	}

	function validateImportData(data: ImportData): string | null {
		if (typeof data !== 'object' || data === null) return 'Root value is not an object.';
		if (!Array.isArray(data.collections)) return 'Missing "collections" array.';
		if (data.collections.length === 0) return '"collections" array is empty.';
		for (const [ci, col] of data.collections.entries()) {
			if (!col.id) col.id = `imported-col-${ci}`;
			if (!col.name) col.name = `Collection ${ci + 1}`;
			if (Array.isArray(col.tiles)) {
				for (const [ti, tile] of col.tiles.entries()) {
					if (!tile.id) tile.id = `imported-tile-${ci}-${ti}`;
					if (!Array.isArray(tile.queue)) tile.queue = [];
					if (!tile.settings) tile.settings = { repeat: 'All', shuffle: false, zoom: 1.0, zoomX: 50, zoomY: 50 };
				}
			} else {
				col.tiles = [];
			}
		}
		if (!data.version) data.version = '2.0.0';
		return null;
	}

	function restoreMediaRefs(data: ImportData) {
		const media = data.media ?? {};
		for (const col of data.collections) {
			for (const tile of (col.tiles ?? [])) {
				for (const item of (tile.queue ?? [])) {
					if ((item as QueueItem & { mediaRef?: string }).mediaRef) {
						const entry = media[(item as QueueItem & { mediaRef?: string }).mediaRef!];
						if (entry?.url) {
							item.url = entry.url;
							if (entry.name) item.name = entry.name;
							if (entry.duration) item.duration = entry.duration;
							if (entry.thumbnail) item.thumbnail = entry.thumbnail;
						}
					}
				}
			}
		}
	}

	function cloneCollectionsWithFreshIds(cols: ImportData['collections']): Collection[] {
		return cols.map((col) => {
			let allTiles: Tile[] = [];
			if (Array.isArray(col.tiles)) allTiles = [...col.tiles] as Tile[];
			if (Array.isArray(col.scenes)) {
				for (const scene of col.scenes) {
					if (Array.isArray(scene.tiles)) allTiles.push(...(scene.tiles as Tile[]));
				}
			}
			return { id: generateId(), name: col.name, tiles: cloneTiles(allTiles) };
		});
	}

	async function exportProjectFull() {
		const { service, ttl } = exportPanel;
		exportPanel.uploading = true;
		exportPanel.error = null;
		exportPanel.progress = { current: 0, total: 0 };
		try {
			const exportData = await buildProjectExport({
				collections,
				currentCollectionId,
				getBlobFn: (blobId) => getBlobFromDB(blobId),
				service,
				ttl,
				onProgress: (current, total) => { exportPanel.progress = { current, total }; },
			});
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `tribsview-project-${Date.now()}.json`;
			a.click();
			URL.revokeObjectURL(url);
			exportPanel.done = true;
		} catch (err) {
			exportPanel.error = (err as Error).message;
		} finally {
			exportPanel.uploading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		const tag = (event.target as HTMLElement).tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		const key = event.key.toLowerCase();
		switch (key) {
			case ' ':
				event.preventDefault();
				togglePlay();
				break;
			case 'f':
				event.preventDefault();
				toggleFullscreen();
				break;
			case 'l':
				event.preventDefault();
				toggleLock();
				break;
			case 's':
				if (!lock) { event.preventDefault(); toggleShuffleSelected(); }
				break;
			case 'r':
				if (!lock) { event.preventDefault(); cycleRepeatSelected(); }
				break;
		}
	}

	function handleClearDB() {
		clearDB().catch(() => { });
	}

	return {
		get tiles() { return tiles; },
		get isPlay() { return isPlay; },
		get isFS() { return isFS; },
		get lock() { return lock; },
		get selectedID() { return selectedID; },
		get showKeyboard() { return showKeyboard; },
		set showKeyboard(v: boolean) { showKeyboard = v; },
		get isDesktop() { return isDesktop; },
		get collections() { return collections; },
		get currentCollectionId() { return currentCollectionId; },
		get showCollectionsPanel() { return showCollectionsPanel; },
		set showCollectionsPanel(v: boolean) { showCollectionsPanel = v; },
		get popups() { return popups; },
		get contextMenu() { return contextMenu; },
		get collPanel() { return collPanel; },
		get importPanel() { return importPanel; },
		set importPanel(v: ImportPanel) { importPanel = v; },
		get exportPanel() { return exportPanel; },
		set exportPanel(v: ExportPanel) { exportPanel = v; },
		init,
		togglePlay,
		toggleFullscreen,
		enterFullscreen,
		exitFullscreen,
		toggleLock,
		syncAllVideos,
		addTile,
		removeTile,
		selectTile,
		moveTileLeft,
		moveTileRight,
		openPopup,
		closePopup,
		hasPopup,
		getPopupPositionStyle,
		startPopupDrag,
		startPopupResize,
		setZoom,
		resetZoom,
		applyZoomPercent,
		handleZoomScroll,
		setZoomOrigin,
		getZoomViewportStyle,
		handleDragStart,
		handleDragOver,
		handleDrop,
		handleContextMenu,
		closeContextMenu,
		handleContextMenuAction,
		cycleRepeat,
		toggleShuffleSelected,
		cycleRepeatSelected,
		processDroppedFiles,
		handleFileUpload,
		addUrlToTile,
		removeFromQueue,
		handleVideoMetadata,
		handleVideoEnded,
		createNewCollection,
		switchCollection,
		renameCollection,
		duplicateCollection,
		deleteCollection,
		exportToJSON,
		importProcessFile,
		importExecute,
		importHidePanel,
		exportProjectFull,
		handleKeydown,
		handleClearDB,
		collStartRename(id: string, currentName: string) {
			collPanel.renamingId = id;
			collPanel.renameVal = currentName;
			collPanel.confirmId = null;
			setTimeout(() => document.getElementById('coll-rename-' + id)?.focus(), 0);
		},
		collCommitRename() {
			if (collPanel.renamingId && collPanel.renameVal.trim()) {
				renameCollection(collPanel.renamingId, collPanel.renameVal.trim());
			}
			collPanel.renamingId = null;
			collPanel.renameVal = '';
		},
		collCancelRename() {
			collPanel.renamingId = null;
			collPanel.renameVal = '';
		},
		collStartConfirmDelete(id: string) {
			collPanel.confirmId = id;
			collPanel.renamingId = null;
		},
		collCancelDelete() {
			collPanel.confirmId = null;
		},
		collShowNewForm() {
			collPanel.showNew = true;
			collPanel.newName = '';
			collPanel.confirmId = null;
			collPanel.renamingId = null;
			setTimeout(() => document.getElementById('coll-new-input')?.focus(), 0);
		},
		collSubmitNew() {
			const name = collPanel.newName.trim();
			if (!name) return;
			createNewCollection(name);
			collPanel.showNew = false;
			collPanel.newName = '';
		},
		collCancelNew() {
			collPanel.showNew = false;
			collPanel.newName = '';
		},
	};
}

export const appState = createAppState();
