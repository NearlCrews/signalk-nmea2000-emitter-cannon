// CanboatJS JSON envelope shape. Every emitted PGN must match.
export interface N2KMessage {
	prio: number;
	pgn: number;
	dst: number;
	fields: Record<string, N2KFieldValue>;
}

export type N2KFieldValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| Buffer
	| N2KFieldValue[]
	| N2KFieldObject;

interface N2KFieldObject {
	[key: string]: N2KFieldValue;
}

export class N2KValidationError extends Error {
	constructor(
		message: string,
		public readonly field?: string,
	) {
		super(message);
		this.name = "N2KValidationError";
	}
}
