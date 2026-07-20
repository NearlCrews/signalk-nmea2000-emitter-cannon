import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, SOURCE_TYPE } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";

// PGNs added to the transmit list independent of the registry's conversion-
// title walk:
//   59392 / 59904 / 60928: ISO transport (Acknowledgement, Request, Address
//                          Claim). Owned by Signal K's NMEA 2000 stack.
//   126464:                PGN List itself, this conversion's own PGN. The
//                          registry walks data conversions before this factory
//                          runs, so the title cannot self-advertise via the
//                          derived list and we add it here.
//   126993:                Heartbeat (canboatjs N2kDevice >= 2.5 auto-emits at
//                          ~60 s nominal). Advertising it keeps the transmit
//                          list consistent with observed heartbeat traffic.
//   126996:                Product Information (canboatjs N2kDevice auto-emits
//                          on address claim and on ISO requests for PGN 126996).
const ALWAYS_TX_PGNS: ReadonlyArray<number> = [59392, 59904, 60928, 126464, 126993, 126996];

// 126464 itself is bidirectional (RX/TX), and we accept ISO Address Claim
// (60928) and ISO Group Function (126208) so canboatjs's transport layer can
// participate in J1939 address negotiation and remote rate-control commands.
// 59904 ISO Request remains here because consumers may explicitly ask for
// 126464 / 126993 / 126996; canboatjs auto-answers but the spec defines this
// path as inbound for the device.
const RECEIVE_PGNS: ReadonlyArray<number> = [59904, 60928, 126208, 126464];

// 5 minutes. PGN 126464 carries identity metadata that N2K consumers cache
// after address claim. The current Signal K provider does not expose the
// active canboatjs N2kDevice to plugins, so its directed ISO Request response
// uses only the provider's static transmitPGNs table. This broadcast is the
// plugin-level delivery path until Signal K adds PGN registration support.
const PGN_LIST_INTERVAL_MS = 300_000;

/**
 * Build the 126464 conversion. `dataTransmitPgns` is the title-derived list
 * of every PGN the loaded conversion modules advertise (built by the registry
 * before this factory runs); we union with ALWAYS_TX_PGNS for the PGNs that
 * have no owning module (or, in 126464's case, cannot self-advertise via the
 * walk) but still leave the device on the wire.
 *
 * The result is unique and sorted ascending so the wire bytes are
 * deterministic (handy for the embedded round-trip test and for operators
 * who eyeball the canboatjs debug log).
 */
export default function createPgnListConversion(
	dataTransmitPgns: ReadonlyArray<number>,
): ConversionModule {
	const transmitPgns = Array.from(new Set([...dataTransmitPgns, ...ALWAYS_TX_PGNS])).sort(
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
		{
			prio: N2K_DEFAULT_PRIORITY,
			pgn: 126464,
			dst: N2K_BROADCAST_DST,
			fields: {
				functionCode: "Receive PGN list",
				list: RECEIVE_PGNS.map((pgn) => ({ pgn })),
			},
		},
	];

	return {
		title: "PGN List (PGN 126464)",
		optionKey: "PGN_LIST",
		category: "system",
		sourceType: SOURCE_TYPE.TIMER,
		interval: PGN_LIST_INTERVAL_MS,
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
