import { SEATALK_NETWORK_GROUPS } from "../config/enums.js";
import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionModule,
	ConversionOptions,
	SignalKApp,
	SignalKPlugin,
	SubConversionModule,
} from "../types/index.js";
import { isValidSignalKId, toFiniteInRange } from "../utils/validation.js";

// Set view of the shared canboat SEATALK_NETWORK_GROUP label list for the O(1)
// membership check below. An out-of-enum label would not match the PGN 126720
// `group` LOOKUP and canboatjs would write a corrupt byte (the raw string
// falls through), so an unrecognized configured label falls back to a safe
// default instead.
const SEATALK_GROUP_SET: ReadonlySet<string> = new Set(SEATALK_NETWORK_GROUPS);
const DEFAULT_BRIGHTNESS_GROUP = "Helm 2";

interface BrightnessGroup {
	signalkId: string;
	// groupLabel is the human-readable NMEA 2000 group label string (e.g.
	// "Helm 1"). The previous name `instanceId` collided with the numeric
	// instance ids used by battery/engine/solar/exhaust editors.
	groupLabel: string;
}

function isBrightnessGroup(v: unknown): v is BrightnessGroup {
	if (typeof v !== "object" || v === null) return false;
	const obj = v as Record<string, unknown>;
	// isValidSignalKId, not a bare string check: the id is interpolated into a
	// subscription path, so a value containing a dot would silently build a path
	// that never fires. The sibling electrical conversions guard the same way.
	return isValidSignalKId(obj.signalkId) && typeof obj.groupLabel === "string";
}

export default function createRaymarineBrightnessConversion(
	_app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule<[number | null]> {
	const conversions = (options: ConversionOptions): SubConversionModule<[number | null]>[] => {
		const raw = options.groups;
		if (!Array.isArray(raw) || raw.length === 0) {
			return [];
		}
		const groups = raw.filter(isBrightnessGroup);
		if (groups.length === 0) {
			return [];
		}

		return groups.map((group) => {
			// Validate the configured label against the SEATALK_NETWORK_GROUP
			// enum so an unknown value cannot reach canboatjs as a corrupt byte.
			const n2kGroup = SEATALK_GROUP_SET.has(group.groupLabel)
				? group.groupLabel
				: DEFAULT_BRIGHTNESS_GROUP;
			return {
				title: `Raymarine Display Brightness ${group.groupLabel} (PGN 126720)`,
				keys: [`electrical.displays.raymarine.${group.signalkId}.brightness`],
				callback: (brightness: number | null) => {
					// A Signal K ratio, scaled to the uint8 percent the Seatalk frame
					// carries. A provider publishing 0 to 100 instead would scale to
					// 8500, wrap, and set a real display's backlight to 52 percent, so
					// anything outside the ratio range is rejected rather than sent.
					const ratio = toFiniteInRange(brightness, 0, 1);
					if (ratio === undefined) {
						return [];
					}

					return [
						{
							prio: N2K_DEFAULT_PRIORITY,
							pgn: 126720,
							dst: N2K_BROADCAST_DST,
							// Fields match canboat's "Seatalk1: Display Brightness"
							// variant (proprietaryId "Display" = 140, command1
							// "Settings" = 12, command NUMBER match 0). The earlier
							// shape (proprietaryId "0x0c8c", command "Brightness",
							// stray unknown1, missing command1/shared) did not match
							// any variant, so canboatjs could not encode a frame a
							// Raymarine MFD would recognize.
							fields: {
								manufacturerCode: "Raymarine",
								industryCode: "Marine Industry",
								proprietaryId: "Display",
								command1: "Settings",
								group: n2kGroup,
								shared: "Shared",
								command: 0,
								brightness: ratio * 100,
								unknown2: 0,
							},
						},
					];
				},
				tests: [
					{
						input: [0.85],
						// Expected is the canboatjs-decoded frame: the command NUMBER
						// (emitted as 0) decodes back to its label "Brightness". The
						// `group` is the validated n2kGroup, so a configured label
						// outside SEATALK_NETWORK_GROUP round-trips as the fallback.
						expected: [
							{
								prio: 2,
								pgn: 126720,
								dst: 255,
								fields: {
									manufacturerCode: "Raymarine",
									industryCode: "Marine Industry",
									proprietaryId: "Display",
									command1: "Settings",
									group: n2kGroup,
									shared: "Shared",
									command: "Brightness",
									brightness: 85,
									unknown2: 0,
								},
							},
						],
					},
				],
			};
		});
	};

	return {
		title: "Raymarine Display Brightness (PGN 126720)",
		optionKey: "RAYMARINE_BRIGHTNESS",
		category: "comms",
		presets: ["raymarine"],
		// Without testOptions the harness calls conversions({}) -> [], so the
		// embedded round-trip test never runs. Supply a valid group ("Cockpit")
		// and an out-of-enum one ("Bogus") so the 126720 frame is exercised
		// against the canboatjs encoder/decoder and the group fallback is proven:
		// "Bogus" is not a SEATALK_NETWORK_GROUP, so it round-trips as the
		// DEFAULT_BRIGHTNESS_GROUP rather than a corrupt byte.
		testOptions: {
			groups: [
				{ signalkId: "0", groupLabel: "Cockpit" },
				{ signalkId: "1", groupLabel: "Bogus" },
			],
		},
		conversions,
	};
}
