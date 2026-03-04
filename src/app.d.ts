import type { ElectronAPI } from '../electron/preload';

declare global {
	namespace App {
		interface Window {
			electronAPI: ElectronAPI;
		}
	}
}

export { };
