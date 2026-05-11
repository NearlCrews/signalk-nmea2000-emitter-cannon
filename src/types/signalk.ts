import type { ServerAPI } from "@signalk/server-api";
import type { JSONSchema7 } from "json-schema";
import type { N2KMessage } from "./nmea2000.js";

export interface SignalKApp extends ServerAPI {
	emit(event: "nmea2000JsonOut", data: N2KMessage): boolean;
	on(event: "nmea2000OutAvailable", callback: () => void): this;
	removeListener(event: "nmea2000OutAvailable", callback: () => void): this;
}

export type JSONSchema = JSONSchema7;
