export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): T {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return function (this: unknown, ...args: Parameters<T>) {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn.apply(this, args), ms);
	} as T;
}
