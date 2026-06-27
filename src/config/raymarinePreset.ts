/**
 * Single source of truth for the one-click "Raymarine" preset's source and
 * instance remap.
 *
 * Raymarine Axiom MFDs (Lighthouse) and the i70/i70s render only the "Inside
 * Temperature" temperature source and the "Inside" humidity source, separating
 * multiple sensors by NMEA 2000 instance (0-9) rather than by source type. So a
 * "Refrigeration Temperature" or "Freezer Temperature" frame never appears on
 * an Axiom even though the data is on the bus.
 *
 * The preset collapses the inside-family temperature sources onto "Inside
 * Temperature" with distinct instances, and pairs inside humidity to instance
 * 0, so every cabin/galley sensor shows up on a Raymarine display with no
 * per-conversion editing. Temperature entries target PGN 130316 (the
 * TEMPERATURE2_* conversions): that extended-range frame is the one Axiom reads
 * for inside temperatures.
 *
 * This table is consumed in two places, so the key set, sources, and instances
 * stay in one spot: the panel reducer (applyPreset) writes these extras, and
 * the temperature/humidity conversion modules read it to add the "raymarine"
 * preset tag to exactly the keys listed here.
 */
import type { PresetTag } from "./enums.js";

export interface RaymarinePatch {
	/** NMEA 2000 source-type string written into the conversion's `n2kSource` extra. */
	n2kSource: string;
	/** NMEA 2000 instance (0-9) written into the conversion's `instance` extra. */
	instance: number;
}

export const RAYMARINE_EXTRAS_PATCH: Record<string, RaymarinePatch> = {
	TEMPERATURE2_INSIDE: { n2kSource: "Inside Temperature", instance: 0 },
	TEMPERATURE2_MAINCABIN: { n2kSource: "Inside Temperature", instance: 1 },
	TEMPERATURE2_REFRIGERATOR: { n2kSource: "Inside Temperature", instance: 2 },
	TEMPERATURE2_FREEZER: { n2kSource: "Inside Temperature", instance: 3 },
	TEMPERATURE2_ENGINEROOM: { n2kSource: "Inside Temperature", instance: 4 },
	HUMIDITY_INSIDE: { n2kSource: "Inside", instance: 0 },
};

// The preset tags for a temperature or humidity conversion: a key the Raymarine
// remap touches also carries the "raymarine" tag, so the preset enables it and
// the panel counts it. Shared by temperature.ts and humidity.ts so the tag set
// stays derived from this one patch table.
export function raymarinePresetsFor(optionKey: string): PresetTag[] {
	return optionKey in RAYMARINE_EXTRAS_PATCH
		? ["environmental", "raymarine"]
		: ["environmental"];
}
