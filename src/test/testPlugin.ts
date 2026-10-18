import { RootConfig } from "../config/schema.js";
import type { SignalKPlugin } from "../types/index.js";

/** The plugin object the suites hand to factories that need one. */
export const mockPlugin: SignalKPlugin = {
	id: "signalk-nmea2000-emitter-cannon",
	name: "Test Plugin",
	description: "Test plugin",
	schema: () => RootConfig,
	start: () => {},
	stop: () => {},
};
