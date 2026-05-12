import type { Path } from "@signalk/server-api";
import type { SignalKApp } from "../types/index.js";

/**
 * Sorted unique list of Signal K paths the local server currently publishes.
 * Empty when the streambundle exposes no active publishers.
 */
export function enumerateActivePaths(app: SignalKApp): string[] {
	const raw = app.streambundle?.getAvailablePaths?.() ?? [];
	const set = new Set<string>();
	for (const p of raw) set.add(String(p));
	return [...set].sort();
}

/**
 * Source labels (dot-joined `/sources` tree ancestors) under which the given
 * path has been published. Used by the panel's source dropdown when a user
 * focuses a per-conversion source field. Walk depth equals `/sources` tree
 * depth (typically 2-3); this is not a hot path.
 */
export function enumerateSourcesForPath(
	app: SignalKApp,
	path: string,
): string[] {
	const tree = app.getPath?.("/sources" as Path);
	if (!tree || typeof tree !== "object") return [];
	const out = new Set<string>();
	const parts = path.split(".");
	walk(tree as Record<string, unknown>, parts, [], out);
	return [...out].sort();
}

function walk(
	node: Record<string, unknown>,
	pathParts: string[],
	sourceLabelStack: string[],
	out: Set<string>,
): void {
	if (sourceLabelStack.length > 0 && hasPath(node, pathParts)) {
		out.add(sourceLabelStack.join("."));
		return;
	}
	for (const [k, v] of Object.entries(node)) {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			walk(
				v as Record<string, unknown>,
				pathParts,
				[...sourceLabelStack, k],
				out,
			);
		}
	}
}

function hasPath(node: unknown, parts: string[]): boolean {
	let cur: unknown = node;
	for (const p of parts) {
		if (!cur || typeof cur !== "object") return false;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur !== undefined;
}
