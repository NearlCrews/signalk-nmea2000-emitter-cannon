/**
 * Utility functions for NMEA 2000 message processing and validation
 */

import type { N2KFieldValue, N2KMessage } from "../types/nmea2000.js";
import { N2KValidationError } from "../types/nmea2000.js";

/**
 * Validate that a message conforms to the N2K message structure
 *
 * @param message - Message to validate
 * @returns Validated N2K message
 * @throws N2KValidationError if message is invalid
 */
export function validateN2KMessage(message: unknown): N2KMessage {
	if (!message || typeof message !== "object") {
		throw new N2KValidationError("Message must be an object");
	}

	const msg = message as Record<string, unknown>;

	// Validate required fields
	if (typeof msg.prio !== "number" || msg.prio < 0 || msg.prio > 7) {
		throw new N2KValidationError(
			"prio must be a number between 0 and 7",
			"prio",
		);
	}

	if (typeof msg.pgn !== "number" || msg.pgn < 0) {
		throw new N2KValidationError("pgn must be a positive number", "pgn");
	}

	if (typeof msg.dst !== "number" || msg.dst < 0 || msg.dst > 255) {
		throw new N2KValidationError(
			"dst must be a number between 0 and 255",
			"dst",
		);
	}

	if (!msg.fields || typeof msg.fields !== "object") {
		throw new N2KValidationError("fields must be an object", "fields");
	}

	// Validate optional src field
	if (
		msg.src !== undefined &&
		(typeof msg.src !== "number" || msg.src < 0 || msg.src > 255)
	) {
		throw new N2KValidationError(
			"src must be a number between 0 and 255",
			"src",
		);
	}

	// Validate fields values
	const fields = msg.fields as Record<string, unknown>;
	for (const [key, value] of Object.entries(fields)) {
		if (!isValidN2KFieldValue(value)) {
			throw new N2KValidationError(`Invalid field value for ${key}`, key);
		}
	}

	const result: N2KMessage = {
		prio: msg.prio,
		pgn: msg.pgn,
		dst: msg.dst,
		fields: fields as Record<string, N2KFieldValue>,
	};

	if (msg.src !== undefined) {
		result.src = msg.src as number;
	}

	return result;
}

/**
 * Check if a value is valid for N2K message fields
 *
 * @param value - Value to check
 * @returns true if value is valid N2K field value
 */
export function isValidN2KFieldValue(value: unknown): value is N2KFieldValue {
	if (value === null || value === undefined) return true;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every(isValidN2KFieldValue);
	}
	if (typeof value === "object" && value !== null) {
		// Allow objects (Record<string, unknown>)
		const obj = value as Record<string, unknown>;
		return Object.values(obj).every(isValidN2KFieldValue);
	}
	return false;
}

/**
 * Convert a raw N2K message to a clean format
 * Removes extra properties that may have been added by processing
 *
 * @param message - Raw message object
 * @returns Clean N2K message
 */
export function cleanN2KMessage(message: Record<string, unknown>): N2KMessage {
	// Remove processing artifacts that may be added by canboat
	const cleaned = { ...message };
	delete cleaned.description;
	delete cleaned.src;
	delete cleaned.timestamp;
	delete cleaned.input;
	delete cleaned.id;

	return validateN2KMessage(cleaned);
}

/**
 * Format N2K message for logging
 *
 * @param message - Message to format
 * @returns Formatted string representation
 */
export function formatN2KMessage(message: N2KMessage): string {
	return `PGN ${message.pgn} (prio:${message.prio}, dst:${message.dst}): ${JSON.stringify(message.fields)}`;
}
