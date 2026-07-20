import type { N2KFieldValue, N2KMessage } from "../types/nmea2000.js";
import { N2KValidationError } from "../types/nmea2000.js";
import { isPlainObject, isValidNumber } from "./validation.js";

export function validateN2KMessage(message: unknown): N2KMessage {
	if (!isPlainObject(message)) {
		throw new N2KValidationError("Message must be an object");
	}

	const msg = message;

	if (!isValidNumber(msg.prio) || !Number.isInteger(msg.prio) || msg.prio < 0 || msg.prio > 7) {
		throw new N2KValidationError("prio must be an integer between 0 and 7", "prio");
	}

	if (!isValidNumber(msg.pgn) || !Number.isInteger(msg.pgn) || msg.pgn < 0 || msg.pgn > 0x3ffff) {
		throw new N2KValidationError("pgn must be an integer between 0 and 262143", "pgn");
	}

	if (!isValidNumber(msg.dst) || !Number.isInteger(msg.dst) || msg.dst < 0 || msg.dst > 255) {
		throw new N2KValidationError("dst must be an integer between 0 and 255", "dst");
	}

	if (!isPlainObject(msg.fields)) {
		throw new N2KValidationError("fields must be an object", "fields");
	}

	const fields = msg.fields;
	for (const [key, value] of Object.entries(fields)) {
		if (!isValidN2KFieldValue(value)) {
			throw new N2KValidationError(`Invalid field value for ${key}`, key);
		}
	}

	return {
		prio: msg.prio,
		pgn: msg.pgn,
		dst: msg.dst,
		fields: fields as Record<string, N2KFieldValue>,
	};
}

function isValidN2KFieldValue(value: unknown): value is N2KFieldValue {
	if (value === null || value === undefined) return true;
	if (typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return isValidNumber(value);
	if (Buffer.isBuffer(value)) return true;
	if (Array.isArray(value)) {
		return value.every(isValidN2KFieldValue);
	}
	if (isPlainObject(value)) {
		return Object.values(value).every(isValidN2KFieldValue);
	}
	return false;
}

// Strips processing artifacts that canboatjs / decoders may attach so the
// payload validates against our N2KMessage shape. Test-support only: the
// conversion round-trip suite uses it to normalise decoded frames before
// comparison. The runtime emit path never decodes, so it has no caller in
// production and is tree-shaken out of the bundle.
export function cleanN2KMessage(message: Record<string, unknown>): N2KMessage {
	const cleaned = { ...message };
	delete cleaned.description;
	delete cleaned.src;
	delete cleaned.timestamp;
	delete cleaned.input;
	delete cleaned.id;

	return validateN2KMessage(cleaned);
}

export function formatN2KMessage(message: N2KMessage): string {
	return `PGN ${message.pgn} (prio:${message.prio}, dst:${message.dst}): ${JSON.stringify(message.fields)}`;
}
