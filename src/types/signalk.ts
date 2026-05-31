import type { ServerAPI } from "@signalk/server-api";
import type { N2KMessage } from "./nmea2000.js";

export interface SignalKApp extends ServerAPI {
	emit(event: "nmea2000JsonOut", data: N2KMessage): boolean;
	on(event: "nmea2000OutAvailable", callback: () => void): this;
	removeListener(event: "nmea2000OutAvailable", callback: () => void): this;
	// signalk-server >= 2.x maintains this as a sync mirror of the
	// nmea2000OutAvailable event so plugins started AFTER the one-shot
	// event has already fired can still detect readiness. Typed as optional
	// to keep compatibility with older server builds that may not expose it.
	isNmea2000OutAvailable?: boolean;
	// Admin-auth gate registered by the API router. signalk-server exposes
	// `securityStrategy.addAdminMiddleware(prefix)` at runtime but the typed
	// @signalk/server-api surface does not declare it; this extension keeps
	// `router.ts` typed without resorting to `any`.
	securityStrategy?: {
		addAdminMiddleware: (pathPrefix: string) => void;
	};
}
