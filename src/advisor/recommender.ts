import type { ConversionMetadata } from "../api/types.js";
import type { ConversionMap } from "../config/schema.js";
import { isDefined } from "../utils/pathUtils.js";
import { isN2KSource } from "./busSource.js";
import type { PathInventory, Recommendation, StaleSourcePin } from "./types.js";

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
		// conversion is enabled yet emits nothing, with no error. Two flavors:
		//   - the path is live from some OTHER source: the pin is provably stale
		//     (high confidence, a direct observation).
		//   - the path has no live source at all but QuestDB history saw it in
		//     the look-back window: the pin is probably stale (low confidence),
		//     since the sensor could merely be powered off. Without historic
		//     evidence we make no claim, so QuestDB being off suppresses this
		//     case rather than flagging every momentarily-idle pin.
		// Either way the conversion is silently emitting nothing; clearing the
		// pin lets it follow the live source when one is present.
		if (enabled) {
			const pins = cfg?.sources ?? {};
			const staleSources: StaleSourcePin[] = [];
			const reasonParts: string[] = [];
			for (const e of matched) {
				const pinned = pins[e.path];
				if (!pinned) continue;
				const live = e.liveSources ?? [];
				if (live.length > 0) {
					if (!live.includes(pinned)) {
						staleSources.push({ path: e.path, pinned, liveSources: live });
						reasonParts.push(
							`'${pinned}' for ${e.path} (now ${live.join(", ")})`,
						);
					}
				} else if (e.historic) {
					staleSources.push({ path: e.path, pinned, liveSources: live });
					reasonParts.push(
						`'${pinned}' for ${e.path} (no live source; last seen ${e.historic.lastSeen})`,
					);
				}
			}
			if (staleSources.length > 0) {
				// A live swap (some pin's path is live from another source) is a
				// direct observation (high); a dead-but-historic pin is inferred
				// from history alone (low).
				const anyLiveStale = staleSources.some((s) => s.liveSources.length > 0);
				out.push({
					optionKey: conv.key,
					action: "clear-source",
					currentlyEnabled: true,
					matchedPaths,
					confidence: anyLiveStale ? "high" : "low",
					origin: anyLiveStale ? "live" : "historic",
					reason: `${conv.title}: pinned to ${reasonParts.join(
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
