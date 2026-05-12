import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";

// Single source of truth for the PGN list advertised in PGN 126464.
// Used both for the runtime message and for the embedded test expectation,
// so they cannot drift apart.
const TRANSMIT_PGNS: ReadonlyArray<number> = [
	59392, 59904, 60928, 65288, 126464, 126720, 126983, 126985, 126992, 126996,
	127245, 127250, 127251, 127252, 127257, 127258, 127488, 127489, 127493,
	127498, 127505, 127506, 127508, 128000, 128259, 128267, 129025, 129026,
	129029, 129038, 129039, 129040, 129041, 129283, 129284, 129285, 129291,
	129301, 129302, 129539, 129540, 129794, 129798, 129799, 129802, 129808,
	130074, 130306, 130310, 130311, 130312, 130313, 130314, 130576, 130577,
];

const RECEIVE_PGNS: ReadonlyArray<number> = [59904, 126464];

const pgnListMessages: N2KMessage[] = [
	{
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 126464,
		dst: N2K_BROADCAST_DST,
		fields: {
			functionCode: "Transmit PGN list",
			list: TRANSMIT_PGNS.map((pgn) => ({ pgn })),
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

export default function createPgnListConversion(): ConversionModule {
	return {
		title: "PGN List (PGN 126464)",
		optionKey: "PGN_LIST",
		category: "system",
		keys: ["communication.pgnListRequest"],
		callback: (_pgnListRequest: unknown): N2KMessage[] => pgnListMessages,
		tests: [
			{
				input: [true],
				expected: [
					{
						prio: 2,
						pgn: 126464,
						dst: 255,
						fields: {
							functionCode: "Transmit PGN list",
							list: TRANSMIT_PGNS.map((pgn) => ({ pgn })),
						},
					},
					{
						prio: 2,
						pgn: 126464,
						dst: 255,
						fields: {
							functionCode: "Receive PGN list",
							list: RECEIVE_PGNS.map((pgn) => ({ pgn })),
						},
					},
				],
			},
		],
	};
}
