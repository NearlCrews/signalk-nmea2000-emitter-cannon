import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";

const pgnListMessages: N2KMessage[] = [
	{
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 126464,
		dst: N2K_BROADCAST_DST,
		fields: {
			functionCode: "Transmit PGN list",
			list: [
				59392, 59904, 60928, 65288, 126464, 126720, 126983, 126985, 126992,
				126996, 127245, 127250, 127251, 127252, 127257, 127258, 127488, 127489,
				127493, 127498, 127505, 127506, 127508, 128000, 128259, 128267, 129025,
				129026, 129029, 129038, 129039, 129040, 129041, 129283, 129284, 129285,
				129291, 129301, 129302, 129539, 129540, 129794, 129798, 129799, 129802,
				129808, 130074, 130306, 130310, 130311, 130312, 130313, 130314, 130576,
				130577,
			].map((pgn) => ({ pgn })),
		},
	},
	{
		prio: N2K_DEFAULT_PRIORITY,
		pgn: 126464,
		dst: N2K_BROADCAST_DST,
		fields: {
			functionCode: "Receive PGN list",
			list: [59904, 126464].map((pgn) => ({ pgn })),
		},
	},
];

export default function createPgnListConversion(): ConversionModule {
	return {
		title: "PGN List (PGN 126464)",
		optionKey: "PGN_LIST",
		keys: ["communication.pgnListRequest"],
		callback: (_pgnListRequest: unknown): N2KMessage[] => pgnListMessages,
		tests: [
			{
				input: [true], // PGN list requested
				expected: [
					{
						prio: 2,
						pgn: 126464,
						dst: 255,
						fields: {
							functionCode: "Transmit PGN list",
							list: [
								{ pgn: 59392 },
								{ pgn: 59904 },
								{ pgn: 60928 },
								{ pgn: 65288 },
								{ pgn: 126464 },
								{ pgn: 126720 },
								{ pgn: 126983 },
								{ pgn: 126985 },
								{ pgn: 126992 },
								{ pgn: 126996 },
								{ pgn: 127245 },
								{ pgn: 127250 },
								{ pgn: 127251 },
								{ pgn: 127252 },
								{ pgn: 127257 },
								{ pgn: 127258 },
								{ pgn: 127488 },
								{ pgn: 127489 },
								{ pgn: 127493 },
								{ pgn: 127498 },
								{ pgn: 127505 },
								{ pgn: 127506 },
								{ pgn: 127508 },
								{ pgn: 128000 },
								{ pgn: 128259 },
								{ pgn: 128267 },
								{ pgn: 129025 },
								{ pgn: 129026 },
								{ pgn: 129029 },
								{ pgn: 129038 },
								{ pgn: 129039 },
								{ pgn: 129040 },
								{ pgn: 129041 },
								{ pgn: 129283 },
								{ pgn: 129284 },
								{ pgn: 129285 },
								{ pgn: 129291 },
								{ pgn: 129301 },
								{ pgn: 129302 },
								{ pgn: 129539 },
								{ pgn: 129540 },
								{ pgn: 129794 },
								{ pgn: 129798 },
								{ pgn: 129799 },
								{ pgn: 129802 },
								{ pgn: 129808 },
								{ pgn: 130074 },
								{ pgn: 130306 },
								{ pgn: 130310 },
								{ pgn: 130311 },
								{ pgn: 130312 },
								{ pgn: 130313 },
								{ pgn: 130314 },
								{ pgn: 130576 },
								{ pgn: 130577 },
							],
						},
					},
					{
						prio: 2,
						pgn: 126464,
						dst: 255,
						fields: {
							functionCode: "Receive PGN list",
							list: [{ pgn: 59904 }, { pgn: 126464 }],
						},
					},
				],
			},
		],
	};
}
