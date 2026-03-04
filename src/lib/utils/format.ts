export function formatDuration(seconds: number): string {
	if (!seconds || isNaN(seconds) || seconds < 0) return '--:--';

	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);

	const mm = String(m).padStart(2, '0');
	const ss = String(s).padStart(2, '0');

	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
