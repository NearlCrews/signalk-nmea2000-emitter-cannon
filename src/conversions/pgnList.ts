import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, SOURCE_TYPE } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";

// PGN 126464 cannot self-advertise through the registry's conversion-title
// walk because this factory runs after that walk. Add only this plugin-owned
// PGN here. Signal K's output-ready event confirms that a provider can accept
// messages, but it does not prove that the provider owns an N2kDevice or emits
// any particular transport-layer PGN, so provider-owned PGNs are intentionally
// excluded from this plugin's capability announcement.
const SELF_TX_PGNS: ReadonlyArray<number> = [126464];

// 5 minutes. PGN 126464 carries identity metadata that N2K consumers cache
// after address claim. The current Signal K provider does not expose the
// active canboatjs N2kDevice to plugins, so its directed ISO Request response
// uses only the provider's static transmitPGNs table. This broadcast is the
// plugin-level delivery path until Signal K adds PGN registration support.
const PGN_LIST_INTERVAL_MS = 300_000;

/**
 * Build the 126464 conversion. `dataTransmitPgns` is the title-derived list
 * of every PGN the loaded conversion modules advertise (built by the registry
 * before this factory runs); we union with SELF_TX_PGNS so the list advertises
 * its own plugin-owned PGN.
 *
 * The result is unique and sorted ascending so the wire bytes are
 * deterministic (handy for the embedded round-trip test and for operators
 * who eyeball the canboatjs debug log).
 */
export default function createPgnListConversion(
	dataTransmitPgns: ReadonlyArray<number>,
): ConversionModule {
	const transmitPgns = Array.from(new Set([...dataTransmitPgns, ...SELF_TX_PGNS])).sort(
		(a, b) => a - b,
	);

	const pgnListMessages: N2KMessage[] = [
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 126464,
			dst: N2K_BROADCAST_DST,
			fields: {
				functionCode: "Transmit PGN list",
				list: transmitPgns.map((pgn) => ({ pgn })),
			},
		},
	];

	return {
		title: "PGN List (PGN 126464)",
		optionKey: "PGN_LIST",
		category: "system",
		sourceType: SOURCE_TYPE.TIMER,
		interval: PGN_LIST_INTERVAL_MS,
		immediate: true,
		// Timer mapper invokes callback(app); we ignore it and publish the
		// pre-built identity messages.
		callback: (_app: unknown): N2KMessage[] => pgnListMessages,
		tests: [
			{
				input: [null],
				expected: pgnListMessages,
			},
		],
	};
}
