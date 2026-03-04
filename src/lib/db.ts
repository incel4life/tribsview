import { DB_NAME, DB_VERSION, APP_VERSION, SAVE_DEBOUNCE_MS } from '$lib/constants';
import type { Collection, Tile } from '$lib/types';

let db: IDBDatabase | null = null;
let dbReady = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function initDB(): Promise<void> {
	return new Promise((resolve, reject) => {
		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(DB_NAME, DB_VERSION);
		} catch (err) {
			reject(err);
			return;
		}

		request.onerror = () => reject(request.error);

		request.onsuccess = () => {
			db = request.result;
			dbReady = true;
			db.onclose = () => {
				console.warn('[db] Connection closed unexpectedly.');
				dbReady = false;
			};
			resolve();
		};

		request.onupgradeneeded = (event) => {
			const database = (event.target as IDBOpenDBRequest).result;
			if (!database.objectStoreNames.contains('state')) {
				database.createObjectStore('state', { keyPath: 'id' });
			}
			if (!database.objectStoreNames.contains('blobs')) {
				database.createObjectStore('blobs', { keyPath: 'id' });
			}
		};

		request.onblocked = () => {
			console.warn('[db] Upgrade blocked — close other tabs and reload.');
		};
	});
}

export async function loadFromDB(): Promise<{ collections: Collection[]; currentCollectionId: string | null } | null> {
	if (!db) return null;

	return new Promise((resolve, reject) => {
		const transaction = db!.transaction(['state'], 'readonly');
		const store = transaction.objectStore('state');
		const request = store.get('appState');

		request.onsuccess = async () => {
			if (request.result) {
				const data = request.result;
				try {
					const collections = await deserializeCollections(data.collections || []);
					return resolve({ collections, currentCollectionId: data.currentCollectionId ?? null });
				} catch (err) {
					console.error('[db] Deserialisation error:', err);
					return resolve({ collections: [], currentCollectionId: null });
				}
			}
			resolve(null);
		};

		request.onerror = () => reject(request.error);
	});
}

export function scheduleAutoSave(collections: Collection[], currentCollectionId: string | null): void {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => persistStateToDB(collections, currentCollectionId), SAVE_DEBOUNCE_MS);
}

async function persistStateToDB(collections: Collection[], currentCollectionId: string | null): Promise<void> {
	if (!db) return;

	const data = {
		id: 'appState',
		version: APP_VERSION,
		collections: serializeCollections(collections),
		currentCollectionId,
		lastSaved: Date.now(),
	};

	return new Promise((resolve, reject) => {
		const transaction = db!.transaction(['state'], 'readwrite');
		const store = transaction.objectStore('state');
		const request = store.put(data);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

export async function saveBlobToDB(blobId: string, blob: Blob): Promise<void> {
	if (!db) return;

	return new Promise((resolve, reject) => {
		const transaction = db!.transaction(['blobs'], 'readwrite');
		const store = transaction.objectStore('blobs');
		const request = store.put({
			id: blobId,
			blob,
			type: blob.type || 'video/mp4',
			size: blob.size,
			savedAt: Date.now(),
		});
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

export async function getBlobFromDB(blobId: string): Promise<Blob | null> {
	if (!db || !blobId) return null;

	return new Promise((resolve, reject) => {
		const transaction = db!.transaction(['blobs'], 'readonly');
		const store = transaction.objectStore('blobs');
		const request = store.get(blobId);

		request.onsuccess = async () => {
			const result = request.result;
			if (!result?.blob) {
				resolve(null);
				return;
			}
			const storedBlob: Blob = result.blob;
			const expectedType: string = result.type || 'video/mp4';
			if (storedBlob.type !== expectedType) {
				try {
					const buffer = await storedBlob.arrayBuffer();
					resolve(new Blob([buffer], { type: expectedType }));
				} catch {
					resolve(storedBlob);
				}
			} else {
				resolve(storedBlob);
			}
		};

		request.onerror = () => reject(request.error);
	});
}

export async function deleteBlobFromDB(blobId: string): Promise<void> {
	if (!db || !blobId) return;

	return new Promise((resolve, reject) => {
		const transaction = db!.transaction(['blobs'], 'readwrite');
		transaction.objectStore('blobs').delete(blobId);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
	});
}

export async function clearDB(): Promise<void> {
	if (!db) return;

	return new Promise((resolve, reject) => {
		const transaction = db!.transaction(['state', 'blobs'], 'readwrite');
		transaction.objectStore('state').delete('appState');
		transaction.objectStore('blobs').clear();
		transaction.oncomplete = () => {
			resolve();
			location.reload();
		};
		transaction.onerror = () => reject(transaction.error);
	});
}

function serializeCollections(collections: Collection[]): unknown {
	return JSON.parse(
		JSON.stringify(collections, (key, value) => {
			if (key.startsWith('_')) return undefined;
			if (key === 'url' && typeof value === 'string' && value.startsWith('blob:')) return undefined;
			return value;
		})
	);
}

async function deserializeCollections(collections: unknown[]): Promise<Collection[]> {
	const result: Collection[] = JSON.parse(JSON.stringify(collections));

	for (const collection of result) {
		if (Array.isArray(collection.tiles)) {
			for (const tile of collection.tiles) {
				if (!Array.isArray(tile.queue)) continue;
				for (const item of tile.queue) {
					if (!item.blobId) continue;
					try {
						const blob = await getBlobFromDB(item.blobId);
						item.url = blob ? URL.createObjectURL(blob) : null;
					} catch (err) {
						console.error('[db] Failed to restore blob URL for', item.blobId, ':', err);
						item.url = null;
					}
				}
			}
		}
	}

	return result;
}

export function resetTransientTileState(tile: Tile): Tile {
	tile._showQueue = false;
	tile._zoomHover = null;
	tile._urlInput = '';
	tile._urlResolving = false;
	tile._urlCobaltStatus = null;
	tile._videoWarning = null;
	tile._videoWidth = 0;
	tile._videoHeight = 0;
	tile._currentIndex = 0;
	if (tile.settings.zoomX === undefined) tile.settings.zoomX = 50;
	if (tile.settings.zoomY === undefined) tile.settings.zoomY = 50;
	return tile;
}

export function isDBReady(): boolean {
	return dbReady;
}
