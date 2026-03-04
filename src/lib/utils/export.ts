import {
	EXPORT_VERSION,
	LITTERBOX_API,
	CATBOX_API,
	LITTERBOX_DEFAULT_TTL,
} from '$lib/constants';
import type { Collection } from '$lib/types';

export async function uploadToLitterbox(blob: Blob, filename: string, ttl = LITTERBOX_DEFAULT_TTL): Promise<string> {
	const form = new FormData();
	form.append('reqtype', 'fileupload');
	form.append('time', ttl);
	form.append('fileToUpload', blob, filename);

	const response = await fetch(LITTERBOX_API, { method: 'POST', body: form });
	if (!response.ok) throw new Error(`Litterbox upload failed: HTTP ${response.status}`);
	const text = (await response.text()).trim();
	if (!text.startsWith('http')) throw new Error(`Litterbox unexpected response: "${text}"`);
	return text;
}

export async function uploadToCatbox(blob: Blob, filename: string): Promise<string> {
	const form = new FormData();
	form.append('reqtype', 'fileupload');
	form.append('userhash', '');
	form.append('fileToUpload', blob, filename);

	const response = await fetch(CATBOX_API, { method: 'POST', body: form });
	if (!response.ok) throw new Error(`Catbox upload failed: HTTP ${response.status}`);
	const text = (await response.text()).trim();
	if (!text.startsWith('http')) throw new Error(`Catbox unexpected response: "${text}"`);
	return text;
}

function generateMediaId(): string {
	return `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureVideoExtension(name: string): string {
	const videoExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
	const lower = (name ?? '').toLowerCase();
	if (videoExts.some((ext) => lower.endsWith(ext))) return name;
	return `${name ?? 'video'}.mp4`;
}

export async function buildProjectExport(opts: {
	collections: Collection[];
	currentCollectionId: string | null;
	getBlobFn: (blobId: string) => Promise<Blob | null>;
	service?: 'litterbox' | 'catbox';
	ttl?: string;
	onProgress?: (current: number, total: number) => void;
}) {
	const { collections, currentCollectionId, getBlobFn, service = 'litterbox', ttl = LITTERBOX_DEFAULT_TTL, onProgress = () => {} } = opts;

	const mediaMap: Record<string, {
		url: string | null;
		name: string;
		source: string;
		hosted: boolean;
		uploadService?: string;
		error?: string;
		hostedAt?: string;
		originalBlobId?: string;
	}> = {};

	const blobQueue: Array<{ mediaId: string; blobId: string; name: string }> = [];

	const exportCollections = collections.map((col) => ({
		id: col.id,
		name: col.name,
		tiles: (col.tiles ?? []).map((tile) => {
			const exportQueue = (tile.queue ?? [])
				.map((item) => {
					if (!item.url && !item.blobId) return null;
					const mediaId = generateMediaId();
					if (item.blobId) {
						blobQueue.push({ mediaId, blobId: item.blobId, name: item.name ?? 'video' });
						mediaMap[mediaId] = { name: item.name ?? 'video', source: 'upload', uploadService: service, hosted: false, url: null };
					} else {
						mediaMap[mediaId] = { url: item.url, name: item.name ?? 'URL Video', source: 'url', hosted: false };
					}
					return { mediaRef: mediaId, name: item.name, duration: item.duration, thumbnail: item.thumbnail };
				})
				.filter(Boolean);
			return { id: tile.id, order: tile.order ?? 0, settings: { ...tile.settings }, queue: exportQueue };
		}),
	}));

	const total = blobQueue.length;
	onProgress(0, total);

	for (let i = 0; i < blobQueue.length; i++) {
		const { mediaId, blobId, name } = blobQueue[i];
		try {
			const blob = await getBlobFn(blobId);
			if (!blob) {
				mediaMap[mediaId].error = 'Blob not found.';
			} else {
				const filename = ensureVideoExtension(name);
				const hostedUrl = service === 'litterbox' ? await uploadToLitterbox(blob, filename, ttl) : await uploadToCatbox(blob, filename);
				mediaMap[mediaId].url = hostedUrl;
				mediaMap[mediaId].hosted = true;
				mediaMap[mediaId].hostedAt = new Date().toISOString();
				mediaMap[mediaId].originalBlobId = blobId;
			}
		} catch (err) {
			mediaMap[mediaId].error = (err as Error).message;
		}
		onProgress(i + 1, total);
	}

	const totalTiles = exportCollections.reduce((acc, c) => acc + c.tiles.length, 0);
	const failedUploads = Object.values(mediaMap).filter((m) => m.error).length;

	return {
		version: EXPORT_VERSION,
		appName: 'tribsview',
		exportedAt: new Date().toISOString(),
		collections: exportCollections,
		media: mediaMap,
		currentCollectionId,
		metadata: {
			totalCollections: exportCollections.length,
			totalTiles,
			totalMedia: Object.keys(mediaMap).length,
			failedUploads,
			uploadService: service,
			uploadTTL: service === 'litterbox' ? ttl : 'permanent',
			exportVersion: EXPORT_VERSION,
		},
	};
}
