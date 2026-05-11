import type { SignalKApp } from "../types/signalk.js";

// `app.debug` is a debug-library instance that self-gates. Reading `.enabled`
// avoids paying for expensive payload construction (string formatting, JSON
// stringify) when debug output is disabled for the plugin's namespace.
export function isDebugEnabled(app: SignalKApp): boolean {
	return (app.debug as unknown as { enabled?: boolean }).enabled === true;
}
