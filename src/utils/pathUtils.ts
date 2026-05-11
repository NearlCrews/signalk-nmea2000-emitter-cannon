import type { SignalKApp } from "../types/index.js";

export function pathToPropName(path: string): string {
	return path.replace(/\./g, "");
}

export function isDefined<T>(value: T | undefined): value is T {
	return typeof value !== "undefined";
}

export function getSelfValue(app: SignalKApp, path: string): unknown {
	return (app.getSelfPath(path) as { value?: unknown } | undefined)?.value;
}
