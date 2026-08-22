import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, SLOW_DATA_TIMEOUT_MS } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { toN2KDate } from "../utils/dateUtils.js";

const UTC_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const TIME_UNITS_PER_SECOND = 10_000;
const SECONDS_PER_DAY = 86_400;

export default function createTimeDateConversion(): ConversionModule {
	return {
		title: "Time and Date (PGN 129033)",
		optionKey: "TIME_DATE",
		category: "system",
		// Replaying a cached navigation.datetime value would repeatedly announce
		// an old GNSS timestamp as current time.
		allowResend: false,
		keys: ["navigation.datetime"],
		timeouts: [SLOW_DATA_TIMEOUT_MS],
		callback: (datetime: unknown): N2KMessage[] => {
			// Signal K defines navigation.datetime as RFC 3339 UTC. It does not
			// expose the local UTC offset carried by PGN 129033, so leave that
			// field unavailable rather than deriving it from the server host.
			if (typeof datetime !== "string" || !UTC_RFC3339.test(datetime)) return [];
			const sourceDate = new Date(datetime);
			if (!Number.isFinite(sourceDate.getTime())) return [];
			// Date normalizes impossible calendar values (for example, February 30)
			// instead of rejecting them. Ensure the parsed UTC components still
			// match the source before putting the date on the bus.
			if (sourceDate.toISOString().slice(0, 19) !== datetime.slice(0, 19)) return [];
			// Date retains only milliseconds, while Signal K permits arbitrary
			// RFC 3339 fractional precision and PGN 129033 resolves to 0.0001 s.
			// Reapply the source fraction, then round to the wire resolution before
			// emission so a value near midnight carries into the next date instead
			// of decoding as 24:00:00 on the prior date.
			const fraction = /\.(\d+)Z$/.exec(datetime)?.[1];
			const sourceTime =
				sourceDate.getUTCHours() * 3600 +
				sourceDate.getUTCMinutes() * 60 +
				sourceDate.getUTCSeconds() +
				(fraction === undefined ? 0 : Number(`0.${fraction}`));
			let timeUnits = Math.round(sourceTime * TIME_UNITS_PER_SECOND);
			// Only the date comes from the helper: the time is recomputed below to
			// carry the source's sub-millisecond fraction, which a Date cannot hold.
			let date = toN2KDate(sourceDate);
			if (timeUnits >= SECONDS_PER_DAY * TIME_UNITS_PER_SECOND) {
				date += 1;
				timeUnits -= SECONDS_PER_DAY * TIME_UNITS_PER_SECOND;
			}
			if (date < 0 || date > 65_532) return [];
			const time = timeUnits / TIME_UNITS_PER_SECOND;
			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129033,
					dst: N2K_BROADCAST_DST,
					fields: { date, time },
				},
			];
		},
		tests: [
			{
				input: ["2026-07-19T14:59:53.123Z"],
				expected: [
					{
						prio: 2,
						pgn: 129033,
						dst: 255,
						fields: {
							date: "2026.07.19",
							time: "14:59:53.12300",
						},
					},
				],
			},
			{
				input: ["2026-07-19T14:59:53.12345Z"],
				expected: [
					{
						prio: 2,
						pgn: 129033,
						dst: 255,
						fields: {
							date: "2026.07.19",
							time: "14:59:53.12350",
						},
					},
				],
			},
			{
				input: ["2026-07-19T23:59:59.99999Z"],
				expected: [
					{
						prio: 2,
						pgn: 129033,
						dst: 255,
						fields: {
							date: "2026.07.20",
							time: "00:00:00",
						},
					},
				],
			},
			{ input: ["2026-07-19Z"], expected: [] },
			{ input: ["2026-02-30T10:00:00Z"], expected: [] },
			{ input: ["2026-07-19T10:59:53-04:00"], expected: [] },
			{ input: ["not-a-date"], expected: [] },
		],
	};
}
