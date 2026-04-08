/**
 * NMEA 2000 message structure as required by CanboatJS
 * All NMEA 2000 messages must follow this exact format
 */
export interface N2KMessage {
	/** Priority (0-7, typically 2 for data messages, 6 for control) */
	prio: number;
	/** Parameter Group Number - identifies the message type */
	pgn: number;
	/** Destination address (255 for broadcast) */
	dst: number;
	/** Source address (optional, set by canboat) */
	src?: number;
	/** Message fields containing the actual data */
	fields: Record<string, N2KFieldValue>;
}

/**
 * NMEA 2000 field value types
 */
export type N2KFieldValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| N2KFieldValue[]
	| Record<string, unknown>;

/**
 * Error types for N2K message validation
 */
export class N2KValidationError extends Error {
	constructor(
		message: string,
		public readonly field?: string,
	) {
		super(message);
		this.name = "N2KValidationError";
	}
}
