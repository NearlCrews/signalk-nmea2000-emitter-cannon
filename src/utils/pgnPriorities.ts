import type { N2KMessage } from "../types/index.js";

/**
 * Standard priorities for every emitted PGN whose priority is defined by
 * Canboat 7.1.0. Proprietary PGNs and alert PGNs without a defined priority
 * keep the priority supplied by their conversion.
 *
 * PGN 65288 has multiple manufacturer variants. This plugin emits the
 * SeaTalk Alarm variant, whose defined priority is 7.
 *
 * Source: https://github.com/canboat/canboat/blob/v7.1.0/docs/canboat.json
 */
type PgnPriorityTable = Readonly<Partial<Record<number, number>>>;

export const CANBOAT_PGN_PRIORITIES: PgnPriorityTable = {
	65288: 7,
	126464: 6,
	126992: 3,
	127245: 2,
	127250: 2,
	127251: 2,
	127252: 3,
	127257: 3,
	127258: 7,
	127488: 2,
	127489: 2,
	127493: 2,
	127497: 5,
	127498: 5,
	127503: 6,
	127504: 6,
	127505: 6,
	127506: 6,
	127507: 6,
	127508: 6,
	127509: 6,
	128259: 2,
	128267: 3,
	128275: 6,
	129025: 2,
	129026: 2,
	129029: 3,
	129033: 3,
	129038: 4,
	129039: 4,
	129040: 4,
	129041: 4,
	129283: 3,
	129284: 3,
	129291: 3,
	129301: 3,
	129302: 6,
	129539: 6,
	129540: 6,
	129794: 6,
	129798: 4,
	129799: 3,
	129802: 5,
	129808: 4,
	129809: 6,
	129810: 6,
	130306: 2,
	130310: 5,
	130311: 5,
	130312: 5,
	130313: 5,
	130314: 5,
	130316: 5,
	130576: 2,
	130577: 3,
	130578: 2,
};

/**
 * Apply the standard arbitration priority at the transport boundary. Keeping
 * this policy in one place prevents individual conversions from drifting as
 * Canboat definitions are corrected.
 */
export function withCanonicalPgnPriority(message: N2KMessage): N2KMessage {
	const priority = CANBOAT_PGN_PRIORITIES[message.pgn];
	if (priority === undefined || priority === message.prio) return message;
	return { ...message, prio: priority };
}
