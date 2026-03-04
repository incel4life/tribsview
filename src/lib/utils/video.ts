import {
	THUMBNAIL_W,
	THUMBNAIL_H,
	THUMBNAIL_SEEK_TIME,
	THUMBNAIL_QUALITY,
	SUPPORTED_VIDEO_EXTENSIONS,
} from '$lib/constants';

export const UrlStatus = Object.freeze({
	VALID: 'valid',
	INVALID: 'invalid',
	UNSUPPORTED: 'unsupported',
	BAD_PROTOCOL: 'bad-protocol',
} as const);

export type UrlStatusType = (typeof UrlStatus)[keyof typeof UrlStatus];

export function hasVideoExtension(url: string): boolean {
	try {
		const parsed = new URL(url);
		const pathname = parsed.pathname.toLowerCase();
		return SUPPORTED_VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
	} catch {
		return false;
	}
}

export function validateVideoUrl(url: string): { status: UrlStatusType; message?: string; url?: string } {
	if (!url || typeof url !== 'string') {
		return { status: UrlStatus.INVALID, message: 'No URL provided' };
	}
	const trimmedUrl = url.trim();
	if (!trimmedUrl) {
		return { status: UrlStatus.INVALID, message: 'Empty URL' };
	}
	let parsed: URL;
	try {
		parsed = new URL(trimmedUrl);
	} catch {
		return { status: UrlStatus.INVALID, message: 'Invalid URL format' };
	}
	if (!['http:', 'https:'].includes(parsed.protocol)) {
		return { status: UrlStatus.BAD_PROTOCOL, message: 'Only HTTP and HTTPS URLs are supported' };
	}
	if (!hasVideoExtension(trimmedUrl)) {
		return {
			status: UrlStatus.UNSUPPORTED,
			message: 'URL does not appear to be a direct video link. Supported: MP4, WebM, OGG, MOV, MKV, AVI, M4V, 3GP',
		};
	}
	return { status: UrlStatus.VALID, url: trimmedUrl };
}

export function isValidVideoUrl(url: string): boolean {
	return validateVideoUrl(url).status === UrlStatus.VALID;
}

export function extractUrlMetadata(url: string) {
	try {
		const parsed = new URL(url);
		const pathname = parsed.pathname;
		const filename = pathname.split('/').pop() || 'unknown';
		const extensionMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
		const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
		return { filename, extension, hostname: parsed.hostname, pathname };
	} catch {
		return null;
	}
}

export async function generateThumbnail(video: HTMLVideoElement): Promise<string> {
	return new Promise((resolve) => {
		const canvas = document.createElement('canvas');
		canvas.width = THUMBNAIL_W;
		canvas.height = THUMBNAIL_H;
		const ctx = canvas.getContext('2d');

		if (!ctx) {
			resolve('');
			return;
		}

		let captured = false;

		const capture = () => {
			if (captured) return;
			captured = true;
			try {
				ctx.drawImage(video, 0, 0, THUMBNAIL_W, THUMBNAIL_H);
				resolve(canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY));
			} catch {
				resolve('');
			}
		};

		const duration = video.duration || 0;
		const seekTime = duration > 1 ? Math.min(THUMBNAIL_SEEK_TIME, duration * 0.1) : 0;

		if (seekTime > 0) {
			video.addEventListener('seeked', capture, { once: true });
			video.currentTime = seekTime;
			setTimeout(capture, 2500);
		} else {
			capture();
		}
	});
}

export function getAspectRatioWarning(width: number, height: number): string | null {
	if (!width || !height) return null;
	const actual = width / height;
	const target = 9 / 16;
	if (Math.abs(actual - target) > 0.05) {
		return `${width}×${height} (${actual.toFixed(2)}:1)`;
	}
	return null;
}
