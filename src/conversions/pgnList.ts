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
				59392, 59904, 60928, 126996, 126464, 127245, 127258, 127488, 127489,
				127493, 127498, 127506, 127508, 128259, 128267, 128275, 129025, 129026,
				129029, 129033, 129038, 129039, 129040, 129041, 129283, 129285, 129539,
				129540, 129794, 129798, 129799, 129802, 129808, 130306, 130312, 130576,
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
		title: "PGN List (126464)",
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
								{ pgn: 126996 },
								{ pgn: 126464 },
								{ pgn: 127245 },
								{ pgn: 127258 },
								{ pgn: 127488 },
								{ pgn: 127489 },
								{ pgn: 127493 },
								{ pgn: 127498 },
								{ pgn: 127506 },
								{ pgn: 127508 },
								{ pgn: 128259 },
								{ pgn: 128267 },
								{ pgn: 128275 },
								{ pgn: 129025 },
								{ pgn: 129026 },
								{ pgn: 129029 },
								{ pgn: 129033 },
								{ pgn: 129038 },
								{ pgn: 129039 },
								{ pgn: 129040 },
								{ pgn: 129041 },
								{ pgn: 129283 },
								{ pgn: 129285 },
								{ pgn: 129539 },
								{ pgn: 129540 },
								{ pgn: 129794 },
								{ pgn: 129798 },
								{ pgn: 129799 },
								{ pgn: 129802 },
								{ pgn: 129808 },
								{ pgn: 130306 },
								{ pgn: 130312 },
								{ pgn: 130576 },
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
