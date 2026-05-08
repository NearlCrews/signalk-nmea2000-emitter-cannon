import type { ServerAPI } from "@signalk/server-api";
import type { N2KMessage } from "./nmea2000.js";

export interface SignalKApp extends ServerAPI {
	emit(event: "nmea2000JsonOut", data: N2KMessage): boolean;
	on(event: "nmea2000OutAvailable", callback: () => void): this;
	removeListener(event: "nmea2000OutAvailable", callback: () => void): this;
}

export interface JSONSchema {
	type: string;
	title?: string;
	description?: string;
	properties?: Record<string, JSONSchema>;
	required?: string[];
	items?: JSONSchema;
	default?: unknown;
	enum?: unknown[];
}
