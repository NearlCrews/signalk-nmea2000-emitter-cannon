import type { ConversionCompatibility, VendorId, VendorSupport } from "./types.js";

/**
 * Which emitted PGNs each vendor's published NMEA 2000 receive lists include.
 * Read 2026-10-17; docs/pgn-reference.md lists every document, URL, and
 * revision. A PGN is "listed" when every documented model receives it,
 * "limited" when only some do, and "not-listed" when none do. Absence from a
 * list does not prove a display ignores a PGN, so the panel words this as
 * what the lists say, never as what a display does.
 */
interface VendorEvidence {
	listed: ReadonlySet<number>;
	limited: ReadonlySet<number>;
}

// Data PGNs this plugin emits that were checked against every vendor list.
// A test asserts that every PGN in the conversion catalog is here or in
// UNCLASSIFIED_PGNS, so a new conversion cannot ship without a decision.
export const CHECKED_PGNS: ReadonlySet<number> = new Set([
	126983, 126985, 126992, 127245, 127250, 127251, 127252, 127257, 127258, 127488, 127489, 127493,
	127496, 127497, 127498, 127501, 127503, 127504, 127505, 127506, 127507, 127508, 127509, 127751,
	128000, 128259, 128267, 128275, 129025, 129026, 129029, 129033, 129038, 129039, 129040, 129041,
	129283, 129284, 129291, 129301, 129302, 129539, 129540, 129793, 129794, 129798, 129799, 129802,
	129808, 129809, 129810, 130306, 130310, 130311, 130312, 130313, 130314, 130316, 130576, 130577,
	130578,
]);

// PGN 126464 is protocol housekeeping, and 65288 and 126720 are Seatalk
// proprietary messages that no vendor publishes in a receive list.
export const UNCLASSIFIED_PGNS: ReadonlySet<number> = new Set([65288, 126464, 126720]);

export const VENDOR_EVIDENCE: Readonly<Record<VendorId, VendorEvidence>> = {
	// Nine current chartplotter pages (GPSMAP 8400/8600/8700, 16x3 to 7x3,
	// 9000 and 9500, 8x10 to 8x16, 10x2/12x2, and ECHOMAP Ultra 2). The newest
	// three moved 127258 to the transmit table and dropped 130577, and only
	// they list 130578.
	garmin: {
		listed: new Set([
			126983, 126985, 126992, 127245, 127250, 127251, 127252, 127257, 127488, 127489, 127493,
			127498, 127501, 127503, 127504, 127505, 127506, 127507, 127508, 127509, 128000, 128259,
			128267, 128275, 129025, 129026, 129029, 129038, 129039, 129040, 129041, 129283, 129284,
			129539, 129540, 129794, 129798, 129799, 129802, 129808, 129809, 129810, 130306, 130310,
			130311, 130312, 130313, 130314, 130316, 130576,
		]),
		limited: new Set([127258, 130577, 130578]),
	},
	// Axiom on LightHouse 4 and the i70s instrument.
	raymarine: {
		listed: new Set([
			127245, 127250, 127251, 127257, 127488, 127489, 127493, 127496, 127497, 127498, 127505,
			127506, 127508, 128259, 128267, 128275, 129025, 129026, 129029, 129033, 129038, 129039,
			129040, 129041, 129283, 129284, 129291, 129802, 129809, 129810, 130306, 130310, 130311,
			130312, 130316, 130576, 130577,
		]),
		limited: new Set([
			126983, 126985, 126992, 127258, 127503, 127504, 127507, 127509, 127751, 129301, 129539,
			129540, 129793, 129794, 129798, 129808, 130313, 130314, 130578,
		]),
	},
	// B&G Zeus3S and Vulcan, whose receive lists are identical.
	bandg: {
		listed: new Set([
			126992, 127245, 127250, 127251, 127252, 127257, 127258, 127488, 127489, 127493, 127501,
			127503, 127504, 127505, 127506, 127507, 127508, 127509, 128259, 128267, 128275, 129025,
			129026, 129029, 129033, 129038, 129039, 129040, 129041, 129283, 129284, 129539, 129540,
			129793, 129794, 129798, 129802, 129808, 129809, 129810, 130306, 130310, 130311, 130312,
			130313, 130314, 130316, 130576, 130577, 130578,
		]),
		limited: new Set(),
	},
	// TZtouch3 (TZT12F/16F/19F), the TZT X series (TZT10X to TZT24X), and the
	// FI-70 instrument.
	furuno: {
		listed: new Set([
			126992, 127245, 127250, 127251, 127257, 127258, 127488, 127489, 127505, 128259, 128267,
			129025, 129026, 129029, 129033, 129038, 129039, 129040, 129794, 129809, 129810, 130306,
			130310, 130311, 130312, 130313, 130316, 130577,
		]),
		limited: new Set([
			127252, 127493, 127497, 127498, 127503, 127506, 127508, 129041, 129283, 129284, 129291,
			129540, 129793, 129798, 129802, 129808, 130314, 130576, 130578,
		]),
	},
};

const VENDOR_ORDER: readonly VendorId[] = ["garmin", "raymarine", "bandg", "furuno"];

function supportFor(evidence: VendorEvidence, pgn: number): VendorSupport {
	if (evidence.listed.has(pgn)) return "listed";
	return evidence.limited.has(pgn) ? "limited" : "not-listed";
}

// A conversion emitting several PGNs is listed only when every one is, and not
// listed only when none is.
function combine(values: VendorSupport[]): VendorSupport {
	if (values.every((value) => value === "listed")) return "listed";
	return values.every((value) => value === "not-listed") ? "not-listed" : "limited";
}

// Field-specific evidence a receive list cannot express, and notes for the
// cases where the list alone would mislead.
export const CONVERSION_OVERRIDES: Readonly<
	Record<string, { vendors?: Partial<Record<VendorId, VendorSupport>>; note?: string }>
> = {
	TEMPERATURE2_SEA: {
		vendors: { garmin: "limited" },
		note: "Garmin's NMEA 2000 technical reference reads water temperature from PGN 130310, 130311, or 130312, not 130316. The Environmental preset also enables Sea Temperature (PGN 130312) for that reason; enable it by hand if you configure conversions one at a time.",
	},
	TEMPERATURE_SEA: {
		note: "Garmin's NMEA 2000 technical reference reads water temperature from this PGN, or from 130310 or 130311, and not from 130316.",
	},
	TIME_DATE: {
		note: "Garmin chartplotters take the time and date from PGN 129029 instead.",
	},
	SYSTEM_TIME: {
		note: "Garmin chartplotters set their clock from PGN 129029, not from this PGN.",
	},
	ENGINE_TRIP: {
		note: "Current Garmin chartplotters transmit PGN 127497 rather than receive it.",
	},
	NOTIFICATIONS: {
		note: "Raymarine Axiom displays show standard alerts from LightHouse 4.8.164.",
	},
	AIS: {
		note: "Garmin's lists include every PGN here except 129793, the base station report.",
	},
	SWITCH_BANK: {
		note: "Garmin and B&G list this PGN for their own digital switching. Neither documents whether a display shows a bank from another sender, so confirm on the display before relying on it.",
	},
	BATTERY: {
		note: "Give each battery an instance no other device sends: a display alternates between two sources that share one.",
	},
	RAYMARINE_ALARMS: {
		note: "Seatalk proprietary, so it appears in no published receive list and support rests on field reports. Axiom displays document standard alerts (the Notifications conversion) as their alert path.",
	},
	RAYMARINE_BRIGHTNESS: {
		note: "Seatalk proprietary, so it appears in no published receive list and support rests on field reports.",
	},
};

/**
 * The vendor receive-list summary for one conversion, derived from the PGNs in
 * its title, or undefined when none of its PGNs was checked and it has no note.
 */
export function compatibilityFor(
	optionKey: string,
	pgns: readonly string[],
): ConversionCompatibility | undefined {
	const checked = pgns.map(Number).filter((pgn) => CHECKED_PGNS.has(pgn));
	const override = CONVERSION_OVERRIDES[optionKey];
	const vendors: Partial<Record<VendorId, VendorSupport>> = {};
	if (checked.length > 0) {
		for (const vendor of VENDOR_ORDER) {
			const evidence = VENDOR_EVIDENCE[vendor];
			vendors[vendor] =
				override?.vendors?.[vendor] ?? combine(checked.map((pgn) => supportFor(evidence, pgn)));
		}
	}
	if (checked.length === 0 && override?.note === undefined) return undefined;
	return override?.note === undefined ? { vendors } : { vendors, note: override.note };
}
