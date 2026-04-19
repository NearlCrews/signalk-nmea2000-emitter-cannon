import {
	type TemperatureInfo,
	temperatures,
} from "./conversions/temperature.js";
import type { JSONSchema } from "./types/index.js";
import { pathToPropName } from "./utils/pathUtils.js";

/**
 * Build a per-source temperature schema entry for a given PGN.
 * Mirrors the optionKey shape produced by createTemperatureConversions()
 * in src/conversions/temperature.ts so every generated module has a
 * matching admin-UI entry.
 */
function buildTemperatureEntry(
	pgn: 130312 | 130316,
	info: TemperatureInfo,
): JSONSchema {
	const sourcePropName = pathToPropName(info.source);
	const title =
		pgn === 130316 ? `${info.n2kSource} (PGN 130316)` : info.n2kSource;

	return {
		type: "object",
		title,
		description: `PGNs: ${pgn}`,
		properties: {
			enabled: { title: "Enabled", type: "boolean", default: false },
			resend: {
				type: "number",
				title: "Resend (seconds)",
				description:
					"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
				default: 0,
			},
			instance: {
				title: "N2K Temperature Instance",
				description:
					"NMEA 2000 instance ID this temperature is emitted on. Override to match a specific display's expected instance.",
				type: "number",
				default: info.instance,
			},
			[sourcePropName]: {
				title: `Source for ${info.source}`,
				description:
					"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
				type: "string",
			},
		},
	};
}

/**
 * Generate one schema entry for every temperature optionKey emitted by
 * createTemperatureConversions(): 11 sources × 2 PGNs = 22 entries.
 * Prefix `TEMPERATURE` corresponds to PGN 130312, `TEMPERATURE2` to 130316.
 */
function buildTemperatureEntries(): Record<string, JSONSchema> {
	const entries: Record<string, JSONSchema> = {};
	for (const info of temperatures) {
		entries[`TEMPERATURE_${info.option}`] = buildTemperatureEntry(130312, info);
		entries[`TEMPERATURE2_${info.option}`] = buildTemperatureEntry(
			130316,
			info,
		);
	}
	return entries;
}

export const schema: JSONSchema = {
	type: "object",
	title: "Conversions to NMEA2000",
	description:
		"If there is SignalK data for the conversion generate the following NMEA2000 pgns from Signal K data:",
	properties: {
		globalResendInterval: {
			type: "number",
			title: "Global Resend Interval (seconds)",
			description:
				"Default resend interval for all conversions. Individual conversions override this when their own resend value is non-zero.",
			default: 5,
		},
		WIND: {
			type: "object",
			title: "Wind",
			description: "PGNs: 130306",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentwindangleApparent: {
					title: "Source for environment.wind.angleApparent",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				environmentwindspeedApparent: {
					title: "Source for environment.wind.speedApparent",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		DEPTH: {
			type: "object",
			title: "Water Depth",
			description: "PGNs: 128267",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentdepthbelowTransducer: {
					title: "Source for environment.depth.belowTransducer",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		COG_SOG: {
			type: "object",
			title: "COG & SOG",
			description: "PGNs: 129026",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationcourseOverGroundTrue: {
					title: "Source for navigation.courseOverGroundTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationspeedOverGround: {
					title: "Source for navigation.speedOverGround",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		HEADING: {
			type: "object",
			title: "Vessel Heading",
			description: "PGNs: 127250",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationheadingMagnetic: {
					title: "Source for navigation.headingMagnetic",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		BATTERY: {
			type: "object",
			title: "Battery",
			description: "PGNs: 127506, 127508",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				batteries: {
					title: "Battery Mapping",
					type: "array",
					items: {
						type: "object",
						properties: {
							signalkId: { title: "Signal K battery id", type: "string" },
							instanceId: {
								title: "NMEA2000 Battery Instance Id",
								type: "number",
							},
						},
					},
				},
			},
		},
		SPEED: {
			type: "object",
			title: "Speed Through Water",
			description: "PGNs: 128259",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationspeedThroughWater: {
					title: "Source for navigation.speedThroughWater",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		RUDDER: {
			type: "object",
			title: "Rudder Position",
			description: "PGNs: 127245",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				steeringrudderpositioning: {
					title: "Source for steering.rudder.position",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		GPS: {
			type: "object",
			title: "GPS Position",
			description: "PGNs: 129025, 129029",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationposition: {
					title: "Source for navigation.position",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationgnssgeoidalSeparation: {
					title: "Source for navigation.gnss.geoidalSeparation",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationgnssmethod: {
					title: "Source for navigation.gnss.method",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationgnssnumberOfSatellites: {
					title: "Source for navigation.gnss.numberOfSatellites",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationgnsshorizontalDilution: {
					title: "Source for navigation.gnss.horizontalDilution",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		...buildTemperatureEntries(),
		PRESSURE: {
			type: "object",
			title: "Atmospheric Pressure",
			description: "PGNs: 130314",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentoutsidepressure: {
					title: "Source for environment.outside.pressure",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		HUMIDITY_OUTSIDE: {
			type: "object",
			title: "Outside Humidity",
			description: "PGNs: 130313",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentoutsidehumidity: {
					title: "Source for environment.outside.humidity",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		HUMIDITY_INSIDE: {
			type: "object",
			title: "Inside Humidity",
			description: "PGNs: 130313",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentinsidehumidity: {
					title: "Source for environment.inside.humidity",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		ENGINE_PARAMETERS: {
			type: "object",
			title: "Engine Parameters",
			description: "PGNs: 127488, 127489, 130312",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				engines: {
					title: "Engine Mapping",
					type: "array",
					items: {
						type: "object",
						properties: {
							signalkId: { title: "Signal K engine id", type: "string" },
							instanceId: {
								title: "NMEA2000 Engine Instance Id",
								type: "number",
							},
						},
					},
				},
			},
		},
		TANKS: {
			type: "object",
			title: "Tank Levels",
			description: "PGNs: 127505",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				tanks: {
					title: "Tank Mapping",
					type: "array",
					items: {
						type: "object",
						properties: {
							signalkId: { title: "Signal K tank id", type: "string" },
							instanceId: {
								title: "NMEA2000 Tank Instance Id",
								type: "number",
							},
						},
					},
				},
			},
		},
		SYSTEM_TIME: {
			type: "object",
			title: "System Time",
			description: "PGNs: 126992",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		SEA_TEMP: {
			type: "object",
			title: "Sea Temperature",
			description: "PGNs: 130310",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentwatertemperature: {
					title: "Source for environment.water.temperature",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				environmentoutsidetemperature: {
					title: "Source for environment.outside.temperature",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		SOLAR: {
			type: "object",
			title: "Solar Panels",
			description: "PGNs: 127508",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				chargers: {
					title: "Solar Panel Mapping",
					type: "array",
					items: {
						type: "object",
						properties: {
							signalkId: { title: "Signal K charger id", type: "string" },
							panelInstanceId: {
								title: "NMEA2000 Panel Instance Id",
								type: "number",
							},
						},
					},
				},
			},
		},
		ENVIRONMENT_PARAMETERS: {
			type: "object",
			title: "Environmental Parameters",
			description: "PGNs: 130311",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentoutsidepressure: {
					title: "Source for environment.outside.pressure",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		MAGNETIC_VARIANCE: {
			type: "object",
			title: "Magnetic Variance",
			description: "PGNs: 127258",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationmagneticVariance: {
					title: "Source for navigation.magneticVariance",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		RATE_OF_TURN: {
			type: "object",
			title: "Rate of Turn",
			description: "PGNs: 127251",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationrateOfTurn: {
					title: "Source for navigation.rateOfTurn",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		TRUE_HEADING: {
			type: "object",
			title: "True Heading",
			description: "PGNs: 127250",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationheadingTrue: {
					title: "Source for navigation.headingTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		LEEWAY: {
			type: "object",
			title: "Leeway Angle",
			description: "PGNs: 128000",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				performanceleeway: {
					title: "Source for performance.leeway",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		SET_DRIFT: {
			type: "object",
			title: "Set and Drift",
			description: "PGNs: 129291",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentcurrentsetTrue: {
					title: "Source for environment.current.setTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				environmentcurrentdrift: {
					title: "Source for environment.current.drift",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		ATTITUDE: {
			type: "object",
			title: "Vessel Attitude",
			description: "PGNs: 127257",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationattituderoll: {
					title: "Source for navigation.attitude.roll",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationattitudepitch: {
					title: "Source for navigation.attitude.pitch",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationattitudeyaw: {
					title: "Source for navigation.attitude.yaw",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		HEAVE: {
			type: "object",
			title: "Vessel Heave",
			description: "PGNs: 127252",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationheave: {
					title: "Source for navigation.heave",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		DIRECTION_DATA: {
			type: "object",
			title: "Direction Data",
			description: "PGNs: 130577",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationcourseOverGroundTrue: {
					title: "Source for navigation.courseOverGroundTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcourseOverGroundMagnetic: {
					title: "Source for navigation.courseOverGroundMagnetic",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationheadingTrue: {
					title: "Source for navigation.headingTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationheadingMagnetic: {
					title: "Source for navigation.headingMagnetic",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcourseRhumblinenextPointbearingTrue: {
					title: "Source for navigation.courseRhumbline.nextPoint.bearingTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcourseRhumblinenextPointbearingMagnetic: {
					title:
						"Source for navigation.courseRhumbline.nextPoint.bearingMagnetic",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcourseGreatCirclenextPointbearingTrue: {
					title:
						"Source for navigation.courseGreatCircle.nextPoint.bearingTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcourseGreatCirclenextPointbearingMagnetic: {
					title:
						"Source for navigation.courseGreatCircle.nextPoint.bearingMagnetic",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		GNSS_DOPS: {
			type: "object",
			title: "GNSS DOPs",
			description: "PGNs: 129539",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationgnsshorizontalDilution: {
					title: "Source for navigation.gnss.horizontalDilution",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationgnssverticalDilution: {
					title: "Source for navigation.gnss.verticalDilution",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationgnsstitimeDilution: {
					title: "Source for navigation.gnss.timeDilution",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationgnssmode: {
					title: "Source for navigation.gnss.mode",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		GNSS_SATELLITES: {
			type: "object",
			title: "GNSS Satellites",
			description: "PGNs: 129540",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationgnsssatellitesInViewcount: {
					title: "Source for navigation.gnss.satellitesInView.count",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationgnsssatellitesInViewsatellites: {
					title: "Source for navigation.gnss.satellitesInView.satellites",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		AIS: {
			type: "object",
			title: "AIS",
			description: "PGNs: 129038, 129794, 129041",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		AIS_CLASS_B_POSITION: {
			type: "object",
			title: "AIS Class B Position",
			description: "PGNs: 129039",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		AIS_CLASS_B_EXTENDED: {
			type: "object",
			title: "AIS Class B Extended",
			description: "PGNs: 129040",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		CROSS_TRACK_ERROR: {
			type: "object",
			title: "Cross Track Error",
			description: "PGNs: 129283",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationcoursecalcValuescrossTrackError: {
					title: "Source for navigation.course.calcValues.crossTrackError",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		NAVIGATION_DATA: {
			type: "object",
			title: "Navigation Data",
			description: "PGNs: 129284",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationcoursecalcValuesdistance: {
					title: "Source for navigation.course.calcValues.distance",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcoursecalcValuesbearing: {
					title: "Source for navigation.course.calcValues.bearing",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcoursecalcValuesvelocityMadeGood: {
					title: "Source for navigation.course.calcValues.velocityMadeGood",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcoursecalcValueseta: {
					title: "Source for navigation.course.calcValues.eta",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		BEARING_DISTANCE_MARKS: {
			type: "object",
			title: "Bearing Distance Between Marks",
			description: "PGNs: 129302",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationcoursenextPointbearingMagnetic: {
					title: "Source for navigation.course.nextPoint.bearingMagnetic",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcoursenextPointdistance: {
					title: "Source for navigation.course.nextPoint.distance",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		ROUTE_WAYPOINT: {
			type: "object",
			title: "Route and Waypoint Information",
			description: "PGNs: 129285",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationcoursenextPointposition: {
					title: "Source for navigation.course.nextPoint.position",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationcoursenextPointdistance: {
					title: "Source for navigation.course.nextPoint.distance",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		TIME_TO_MARK: {
			type: "object",
			title: "Time to Mark",
			description: "PGNs: 129301",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				navigationcoursenextPointtimeToGo: {
					title: "Source for navigation.course.nextPoint.timeToGo",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		WIND_TRUE_GROUND: {
			type: "object",
			title: "Wind True Over Ground",
			description: "PGNs: 130306",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentwinddirectionTrue: {
					title: "Source for environment.wind.directionTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				environmentwindspeedOverGround: {
					title: "Source for environment.wind.speedOverGround",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		WIND_TRUE: {
			type: "object",
			title: "Wind True Over Water",
			description: "PGNs: 130306",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				environmentwindangleTrueWater: {
					title: "Source for environment.wind.angleTrueWater",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				environmentwindspeedTrue: {
					title: "Source for environment.wind.speedTrue",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		ENGINE_STATIC: {
			type: "object",
			title: "Engine Configuration Parameters",
			description: "PGNs: 127498",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				propulsionmainratedEngineSpeed: {
					title: "Source for propulsion.main.ratedEngineSpeed",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				propulsionmainengineoperatingHours: {
					title: "Source for propulsion.main.engine.operatingHours",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		TRANSMISSION_PARAMETERS: {
			type: "object",
			title: "Transmission Parameters",
			description: "PGNs: 127493",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				propulsionmaintransmissiongearRatio: {
					title: "Source for propulsion.main.transmission.gearRatio",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				propulsionmaintransmissionoilPressure: {
					title: "Source for propulsion.main.transmission.oilPressure",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				propulsionmaintransmissionoilTemperature: {
					title: "Source for propulsion.main.transmission.oilTemperature",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		SMALL_CRAFT_STATUS: {
			type: "object",
			title: "Small Craft Status",
			description: "PGNs: 130576",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				steeringtrimTabport: {
					title: "Source for steering.trimTab.port",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				steeringtrimTabstarboard: {
					title: "Source for steering.trimTab.starboard",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				environmentdepthbelowTransducer: {
					title: "Source for environment.depth.belowTransducer",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
				navigationspeedOverGround: {
					title: "Source for navigation.speedOverGround",
					description:
						"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
					type: "string",
				},
			},
		},
		NOTIFICATIONS: {
			type: "object",
			title: "Notifications",
			description: "PGNs: 126983, 126985",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
				excludePaths: {
					type: "string",
					title: "Exclude Paths",
					description:
						"Comma-separated list of notification path prefixes to ignore (e.g. notifications.sensors.AccessoryBattery,notifications.sensors.EngineBattery)",
					default: "",
				},
			},
		},
		PRODUCT_INFO: {
			type: "object",
			title: "Product Information",
			description: "PGNs: 126996",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		DSC_CALLS: {
			type: "object",
			title: "DSC Call Information",
			description: "PGNs: 129808",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		RAYMARINE_ALARMS: {
			type: "object",
			title: "Raymarine Alarms",
			description: "PGNs: 65288",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		PGN_LIST: {
			type: "object",
			title: "PGN List",
			description: "PGNs: 126464",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		RADIO_FREQUENCY: {
			type: "object",
			title: "Radio Frequency",
			description: "PGNs: 129799",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		RAYMARINE_BRIGHTNESS: {
			type: "object",
			title: "Raymarine Display Brightness",
			description: "PGNs: 126720",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		EXHAUST_TEMPERATURE: {
			type: "object",
			title: "Exhaust Temperature",
			description: "PGNs: 130312",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		AIS_SAR_AIRCRAFT: {
			type: "object",
			title: "AIS SAR Aircraft Position",
			description: "PGNs: 129798",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		AIS_SAFETY_MESSAGE: {
			type: "object",
			title: "AIS Safety Related Broadcast Message",
			description: "PGNs: 129802",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		NAVIGATION_DATA_GREAT_CIRCLE: {
			type: "object",
			title: "Navigation Data (Great Circle)",
			description: "PGNs: 129284",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
		ROUTE_WP_LIST: {
			type: "object",
			title: "Route/WP List",
			description: "PGNs: 129285",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description:
						"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
					default: 0,
				},
			},
		},
	},
};
