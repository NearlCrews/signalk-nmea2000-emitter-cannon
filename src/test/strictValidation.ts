// Test-only strict validator. Imports the canboat PGN definitions
// (~2.6MB) which we deliberately keep out of the runtime bundle. The
// production runtime path uses validateN2KMessage from utils/messageUtils.
import { getEnumerationValue, getPGNWithNumber } from "@canboat/ts-pgns";
import type { N2KMessage } from "../types/index.js";
import { N2KValidationError } from "../types/nmea2000.js";
import { validateN2KMessage } from "../utils/messageUtils.js";

const pgnSchemaCache = new Map<
	number,
	{
		allowedIds: Set<string>;
		lookupsByFieldId: Map<string, Set<string>>;
	} | null
>();

function loadPgnSchema(pgn: number): {
	allowedIds: Set<string>;
	lookupsByFieldId: Map<string, Set<string>>;
} | null {
	const cached = pgnSchemaCache.get(pgn);
	if (cached !== undefined) return cached;

	const defs = getPGNWithNumber(pgn);
	if (!defs || defs.length === 0) {
		pgnSchemaCache.set(pgn, null);
		return null;
	}

	// A PGN number can resolve to several manufacturer/match variants (e.g.
	// 126720 has Airmar, Raymarine, and SeaTalk1 forms). canboatjs picks the
	// variant by its match fields; this validator cannot, so it unions the
	// allowed field Ids and collects EVERY lookup a given field Id uses across
	// variants. A string value is then accepted if it matches any of them.
	const allowedIds = new Set<string>();
	const lookupsByFieldId = new Map<string, Set<string>>();
	let hasRepeatingSet = false;
	for (const def of defs) {
		if ((def.RepeatingFieldSet1Size ?? 0) > 0) hasRepeatingSet = true;
		for (const f of def.Fields ?? []) {
			if (typeof f.Id === "string" && f.Id.length > 0) {
				allowedIds.add(f.Id);
				if (typeof f.LookupEnumeration === "string") {
					let lookups = lookupsByFieldId.get(f.Id);
					if (!lookups) {
						lookups = new Set<string>();
						lookupsByFieldId.set(f.Id, lookups);
					}
					lookups.add(f.LookupEnumeration);
				}
			}
		}
	}
	// canboatjs encodes repeating field sets as a top-level `list` array
	// rather than expanding the per-iteration field Ids; accept it when the
	// canboat definition declares a repeating set.
	if (hasRepeatingSet) allowedIds.add("list");
	const entry = { allowedIds, lookupsByFieldId };
	pgnSchemaCache.set(pgn, entry);
	return entry;
}

// Asserts that every emitted field is a canonical canboat field Id and
// that any string value passed for a LOOKUP field maps to a known enum
// entry. Wrong field names and unmatched enum strings are silently
// dropped or zero-encoded by canboatjs, so this catches regressions
// before they hit the wire.
export function validateN2KMessageStrict(message: unknown): N2KMessage {
	const validated = validateN2KMessage(message);
	const schema = loadPgnSchema(validated.pgn);
	// Unknown PGN: fall back to envelope validation so vendor-specific
	// PGNs not in canboat continue to work.
	if (schema === null) return validated;

	for (const [key, value] of Object.entries(validated.fields)) {
		if (!schema.allowedIds.has(key)) {
			throw new N2KValidationError(
				`PGN ${validated.pgn}: field "${key}" is not a canboat field Id`,
				key,
			);
		}
		if (typeof value !== "string") continue;
		const lookups = schema.lookupsByFieldId.get(key);
		if (!lookups) continue;
		// Accept if the value is a known entry in ANY variant's lookup for
		// this field Id (canboatjs would match exactly one variant on the wire).
		let matched = false;
		for (const lookup of lookups) {
			if (getEnumerationValue(lookup, value) !== undefined) {
				matched = true;
				break;
			}
		}
		if (matched) continue;
		// Some canboat lookups (e.g. TIME_STAMP, with reserved entries
		// at 60..63 and free integer seconds for 0..59) allow numeric
		// strings that fall outside the named enum entries. Accept
		// those; only flag genuinely unmatched labels.
		if (/^-?\d+$/.test(value)) continue;
		throw new N2KValidationError(
			`PGN ${validated.pgn}: field "${key}" value "${value}" is not in lookup ${[...lookups].join(
				", ",
			)}`,
			key,
		);
	}

	return validated;
}
