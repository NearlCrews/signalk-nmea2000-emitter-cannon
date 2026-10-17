/**
 * The vendor receive-list table drives the panel's per-vendor badges. These
 * tests keep it complete: every PGN the catalog emits must be classified, so a
 * new conversion cannot ship without someone checking the vendor lists.
 */

import { describe, expect, it } from "vitest";
import { buildConversionMetadata } from "../api/conversion-metadata.js";
import { findOrphanExtrasMetaKeys } from "../api/extras-meta.js";
import {
	CHECKED_PGNS,
	compatibilityFor,
	UNCLASSIFIED_PGNS,
	VENDOR_EVIDENCE,
} from "../api/vendorSupport.js";
import { RootConfig } from "../config/schema.js";
import { createConversionModules } from "../conversions/index.js";
import type { SignalKApp, SignalKPlugin } from "../types/index.js";

const mockApp = {
	getSelfPath: () => undefined,
	getPath: () => undefined,
	debug: () => {},
	error: () => {},
	emit: () => {},
	on: () => {},
	removeListener: () => {},
	subscriptionmanager: { subscribe: () => {} },
} as unknown as SignalKApp;

const mockPlugin: SignalKPlugin = {
	id: "signalk-nmea2000-emitter-cannon",
	name: "Test Plugin",
	description: "Test plugin",
	schema: () => RootConfig,
	start: () => {},
	stop: () => {},
};

const modules = createConversionModules(mockApp, mockPlugin);
const catalog = buildConversionMetadata(modules);

describe("vendor receive-list table", () => {
	it("classifies every PGN the conversion catalog emits", () => {
		const unclassified = [...new Set(catalog.flatMap((entry) => entry.pgns.map(Number)))].filter(
			(pgn) => !CHECKED_PGNS.has(pgn) && !UNCLASSIFIED_PGNS.has(pgn),
		);
		expect(unclassified).toEqual([]);
	});

	it("keeps the checked, unclassified, and per-vendor sets consistent", () => {
		for (const pgn of UNCLASSIFIED_PGNS) expect(CHECKED_PGNS.has(pgn)).toBe(false);
		for (const [vendor, evidence] of Object.entries(VENDOR_EVIDENCE)) {
			for (const pgn of [...evidence.listed, ...evidence.limited]) {
				expect(CHECKED_PGNS.has(pgn), `${vendor} ${pgn}`).toBe(true);
			}
			for (const pgn of evidence.listed) {
				expect(evidence.limited.has(pgn), `${vendor} ${pgn}`).toBe(false);
			}
		}
	});

	it("names only conversions that exist in its overrides and the other metadata tables", () => {
		expect(findOrphanExtrasMetaKeys(modules)).toEqual([]);
	});

	it("derives one badge per vendor from the emitted PGNs", () => {
		expect(compatibilityFor("NOTIFICATIONS", ["126983", "126985"])?.vendors).toEqual({
			garmin: "listed",
			raymarine: "limited",
			bandg: "not-listed",
			furuno: "not-listed",
		});
		expect(compatibilityFor("TIME_DATE", ["129033"])?.vendors).toEqual({
			garmin: "not-listed",
			raymarine: "listed",
			bandg: "listed",
			furuno: "listed",
		});
		// A multi-PGN conversion is limited when its PGNs disagree.
		expect(compatibilityFor("GPS", ["129025", "129029"])?.vendors.furuno).toBe("listed");
		expect(compatibilityFor("BATTERY", ["127506", "127508"])?.vendors.furuno).toBe("limited");
	});

	it("applies field-specific overrides and notes", () => {
		const sea = compatibilityFor("TEMPERATURE2_SEA", ["130316"]);
		expect(sea?.vendors.garmin).toBe("limited");
		expect(sea?.note).toContain("130312");
		// Proprietary PGNs get a note but no badges, and protocol PGNs get nothing.
		expect(compatibilityFor("RAYMARINE_ALARMS", ["65288"])).toEqual({
			vendors: {},
			note: expect.stringContaining("Seatalk proprietary"),
		});
		expect(compatibilityFor("PGN_LIST", ["126464"])).toBeUndefined();
	});
});
