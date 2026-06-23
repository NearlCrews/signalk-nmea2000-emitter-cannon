import type { ConversionMetadata } from "../api/types.js";
import type { ConversionMap } from "../config/schema.js";
import { isDefined } from "../utils/pathUtils.js";
import { isN2KSource } from "./busSource.js";
import type { PathInventory, Recommendation } from "./types.js";

export interface RecommendInput {
	inventory: PathInventory;
	metadata: ConversionMetadata[];
	currentConfig: ConversionMap;
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
		// Resolve each declared path to its inventory entry once, then read
		// live/liveSources off the entries instead of re-walking the Map.
		const matched = conv.paths.map((p) => byPath.get(p)).filter(isDefined);
		if (matched.length === 0) continue;
		const matchedPaths = matched.map((e) => e.path);

		const cfg = currentConfig[conv.key];
		const enabled = cfg?.enabled ?? false;
		// A match backed by at least one live path is high-confidence; a match
		// seen only in QuestDB history is low-confidence historic origin.
		const anyLive = matched.some((e) => e.live === true);
		const origin: Recommendation["origin"] = anyLive ? "live" : "historic";
		const confidence: Recommendation["confidence"] = anyLive ? "high" : "low";
		// "On the bus" when every matched path's every live source is an N2K
		// device. A path with one native source makes the data native.
		const allBusOrigin = matched.every((e) => {
			const sources = e.liveSources ?? [];
			return sources.length > 0 && sources.every(isN2KSource);
		});

		if (allBusOrigin) {
			out.push({
				optionKey: conv.key,
				action: enabled ? "disable" : "keep",
				currentlyEnabled: enabled,
				matchedPaths,
				confidence,
				origin,
				reason: enabled
					? `${conv.title}: ${matchedPaths.join(", ")} is already published from the NMEA 2000 bus; emitting it would echo.`
					: `${conv.title}: data already on the bus, left disabled.`,
			});
			continue;
		}

		// An enabled conversion can carry a per-path `$source` pin that names a
		// source no longer publishing that path (a renamed provider or a
		// re-enumerated sensor). The pin then matches no incoming delta, so the
		// conversion is enabled yet emits nothing, with no error. Flag it only
		// when the path is live from some OTHER source: an empty liveSources
		// means the path is historic-only, where "the pin is stale" is not a
		// claim we can make.
		if (enabled) {
			const pins = cfg?.sources ?? {};
			const staleSources = matched.flatMap((e) => {
				const pinned = pins[e.path];
				const live = e.liveSources ?? [];
				return pinned && live.length > 0 && !live.includes(pinned)
					? [{ path: e.path, pinned, liveSources: live }]
					: [];
			});
			if (staleSources.length > 0) {
				out.push({
					optionKey: conv.key,
					action: "clear-source",
					currentlyEnabled: true,
					matchedPaths,
					// The path is live from another source, so the dead pin is a
					// direct observation, not an inference.
					confidence: "high",
					origin: "live",
					reason: `${conv.title}: pinned to ${staleSources
						.map(
							(s) =>
								`'${s.pinned}' for ${s.path} (now ${s.liveSources.join(", ")})`,
						)
						.join(
							"; ",
						)}, so it is enabled but emitting nothing. Clearing the pin lets it follow the live source.`,
					staleSources,
				});
				continue;
			}
		}

		out.push({
			optionKey: conv.key,
			action: enabled ? "keep" : "enable",
			currentlyEnabled: enabled,
			matchedPaths,
			confidence,
			origin,
			reason: enabled
				? `${conv.title}: live and emitting, no change.`
				: `${conv.title}: ${matchedPaths.join(", ")} ${
						origin === "historic" ? "was seen in history" : "is live"
					} from a non-N2K source; enabling sends it to the bus.`,
		});
	}

	return out;
}
