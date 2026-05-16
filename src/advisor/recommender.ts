import type { ConversionMetadata } from "../api/types.js";
import type { ConversionConfig } from "../config/schema.js";
import { isN2KSource } from "./busSource.js";
import type { PathInventory, Recommendation } from "./types.js";

export interface RecommendInput {
	inventory: PathInventory;
	metadata: ConversionMetadata[];
	currentConfig: Record<string, ConversionConfig>;
}

/**
 * Deterministic path-to-conversion matcher. Pure: no app, no network.
 * Emits a recommendation only for conversions that matched at least one
 * live path; unmatched conversions and factory conversions (empty `paths`)
 * are skipped.
 */
export function recommend(input: RecommendInput): Recommendation[] {
	const { inventory, metadata, currentConfig } = input;
	const byPath = new Map(inventory.map((e) => [e.path, e]));
	const out: Recommendation[] = [];

	for (const conv of metadata) {
		if (conv.paths.length === 0) continue;
		const matched = conv.paths.filter((p) => byPath.has(p));
		if (matched.length === 0) continue;

		const enabled = currentConfig[conv.key]?.enabled ?? false;
		// A match backed by at least one live path is high-confidence; a match
		// seen only in QuestDB history is low-confidence historic origin.
		const anyLive = matched.some((p) => byPath.get(p)?.live === true);
		const origin: Recommendation["origin"] = anyLive ? "live" : "historic";
		const confidence: Recommendation["confidence"] = anyLive ? "high" : "low";
		// "On the bus" when every matched path's every live source is an N2K
		// device. A path with one native source makes the data native.
		const allBusOrigin = matched.every((p) => {
			const sources = byPath.get(p)?.liveSources ?? [];
			return sources.length > 0 && sources.every(isN2KSource);
		});

		if (allBusOrigin) {
			out.push({
				optionKey: conv.key,
				action: enabled ? "disable" : "keep",
				currentlyEnabled: enabled,
				matchedPaths: matched,
				confidence,
				origin,
				reason: enabled
					? `${conv.title}: ${matched.join(", ")} is already published from the NMEA 2000 bus; emitting it would echo.`
					: `${conv.title}: data already on the bus, left disabled.`,
			});
			continue;
		}

		out.push({
			optionKey: conv.key,
			action: enabled ? "keep" : "enable",
			currentlyEnabled: enabled,
			matchedPaths: matched,
			confidence,
			origin,
			reason: enabled
				? `${conv.title}: live and emitting, no change.`
				: `${conv.title}: ${matched.join(", ")} is live from a non-N2K source; enabling sends it to the bus.`,
		});
	}

	return out;
}
