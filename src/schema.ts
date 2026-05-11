import { DEFAULT_GLOBAL_RESEND_SECONDS } from "./constants.js";
import {
	type TemperatureInfo,
	temperatures,
} from "./conversions/temperature.js";
import type { JSONSchema } from "./types/index.js";
import { pathToPropName } from "./utils/pathUtils.js";

const enabledField = (): JSONSchema => ({
	title: "Enabled",
	type: "boolean",
	default: false,
});

const resendField = (): JSONSchema => ({
	type: "integer",
	title: "Resend (seconds)",
	description:
		"If non-zero, overrides the global resend interval. Set to 0 to use the global default.",
	default: 0,
	minimum: 0,
});

const sourceField = (path: string, titleOverride?: string): JSONSchema => ({
	title: titleOverride ?? `Source for ${path}`,
	description:
		"Leave blank to accept data from any source. Enter a source label (e.g. 'gps1') to match any $source that starts with that label.",
	type: "string",
});

interface PgnEntryOptions {
	title: string;
	pgns: string;
	sources?: string[];
	extras?: Record<string, JSONSchema>;
}

function pgnEntry({
	title,
	pgns,
	sources = [],
	extras = {},
}: PgnEntryOptions): JSONSchema {
	const properties: Record<string, JSONSchema> = {
		enabled: enabledField(),
		resend: resendField(),
	};
	for (const path of sources) {
		properties[pathToPropName(path)] = sourceField(path);
	}
	for (const [key, value] of Object.entries(extras)) {
		properties[key] = value;
	}
	return {
		type: "object",
		title,
		description: `PGNs: ${pgns}`,
		additionalProperties: false,
		properties,
	};
}

function buildTemperatureEntry(
	pgn: 130312 | 130316,
	info: TemperatureInfo,
): JSONSchema {
	return pgnEntry({
		title: `${info.n2kSource} (${pgn})`,
		pgns: String(pgn),
		sources: [info.source],
		extras: {
			instance: {
				title: "N2K Temperature Instance",
				description:
					"NMEA 2000 instance ID this temperature is emitted on. Override to match a specific display's expected instance.",
				type: "number",
				default: info.instance,
			},
		},
	});
}

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

const arrayMapping = (
	title: string,
	itemProperties: Record<string, JSONSchema>,
): JSONSchema => ({
	title,
	type: "array",
	items: { type: "object", properties: itemProperties },
});

export const schema: JSONSchema = {
	type: "object",
	title: "Conversions to NMEA2000",
	description:
		"If there is SignalK data for the conversion generate the following NMEA2000 pgns from Signal K data:",
	additionalProperties: false,
	properties: {
		globalResendInterval: {
			type: "number",
			title: "Global Resend Interval (seconds)",
			description:
				"Default resend interval for all conversions. Individual conversions override this when their own resend value is non-zero.",
			default: DEFAULT_GLOBAL_RESEND_SECONDS,
		},
		WIND: pgnEntry({
			title: "Wind",
			pgns: "130306",
			sources: [
				"environment.wind.angleApparent",
				"environment.wind.speedApparent",
			],
		}),
		DEPTH: pgnEntry({
			title: "Water Depth",
			pgns: "128267",
			sources: ["environment.depth.belowTransducer"],
		}),
		COG_SOG: pgnEntry({
			title: "COG & SOG",
			pgns: "129026",
			sources: [
				"navigation.courseOverGroundTrue",
				"navigation.speedOverGround",
			],
		}),
		HEADING: pgnEntry({
			title: "Vessel Heading",
			pgns: "127250",
			sources: [
				"navigation.headingMagnetic",
				"navigation.magneticVariation",
				"navigation.magneticDeviation",
			],
		}),
		BATTERY: pgnEntry({
			title: "Battery",
			pgns: "127506, 127508",
			extras: {
				batteries: arrayMapping("Battery Mapping", {
					signalkId: { title: "Signal K battery id", type: "string" },
					instanceId: {
						title: "NMEA2000 Battery Instance Id",
						type: "number",
					},
				}),
			},
		}),
		SPEED: pgnEntry({
			title: "Speed Through Water",
			pgns: "128259",
			sources: ["navigation.speedThroughWater"],
		}),
		RUDDER: pgnEntry({
			title: "Rudder Position",
			pgns: "127245",
			sources: ["steering.rudderAngle", "steering.rudderAngleTarget"],
		}),
		GPS: pgnEntry({
			title: "GPS Position",
			pgns: "129025, 129029",
			sources: ["navigation.position"],
		}),
		...buildTemperatureEntries(),
		PRESSURE: pgnEntry({
			title: "Atmospheric Pressure",
			pgns: "130314",
			sources: ["environment.outside.pressure"],
		}),
		HUMIDITY_OUTSIDE: pgnEntry({
			title: "Outside Humidity",
			pgns: "130313",
			sources: [
				"environment.outside.humidity",
				"environment.outside.relativeHumidity",
			],
		}),
		HUMIDITY_INSIDE: pgnEntry({
			title: "Inside Humidity",
			pgns: "130313",
			sources: ["environment.inside.relativeHumidity"],
		}),
		ENGINE_PARAMETERS: pgnEntry({
			title: "Engine Parameters",
			pgns: "127488, 127489, 130312",
			extras: {
				engines: arrayMapping("Engine Mapping", {
					signalkId: { title: "Signal K engine id", type: "string" },
					instanceId: {
						title: "NMEA2000 Engine Instance Id",
						type: "number",
					},
				}),
			},
		}),
		TANKS: pgnEntry({
			title: "Tank Levels",
			pgns: "127505",
			extras: {
				tanks: arrayMapping("Tank Mapping", {
					signalkPath: {
						title: "Signal K tank path (e.g. tanks.fuel.0)",
						type: "string",
					},
					instanceId: {
						title: "NMEA2000 Tank Instance Id",
						type: "number",
					},
				}),
			},
		}),
		SYSTEM_TIME: pgnEntry({ title: "System Time", pgns: "126992" }),
		SEA_TEMP: pgnEntry({
			title: "Sea Temperature",
			pgns: "130310",
			sources: [
				"environment.water.temperature",
				"environment.outside.temperature",
			],
		}),
		SOLAR: pgnEntry({
			title: "Solar Panels",
			pgns: "127508",
			extras: {
				chargers: {
					title: "Solar Mapping",
					type: "array",
					items: {
						type: "object",
						required: ["signalkId", "instanceId", "panelInstanceId"],
						properties: {
							signalkId: { title: "Signal K Solar id", type: "string" },
							instanceId: {
								title: "NMEA2000 Battery Instance Id",
								description: "Used for current/voltage",
								type: "number",
							},
							panelInstanceId: {
								title: "NMEA2000 Battery Panel Instance Id",
								description: "Used for panel current/voltage",
								type: "number",
							},
						},
					},
				},
			},
		}),
		ENVIRONMENT_PARAMETERS: pgnEntry({
			title: "Environmental Parameters",
			pgns: "130311",
			sources: ["environment.outside.pressure"],
		}),
		MAGNETIC_VARIANCE: pgnEntry({
			title: "Magnetic Variance",
			pgns: "127258",
			sources: [
				"navigation.magneticVariation",
				"navigation.magneticVariationAgeOfService",
			],
		}),
		RATE_OF_TURN: pgnEntry({
			title: "Rate of Turn",
			pgns: "127251",
			sources: ["navigation.rateOfTurn"],
		}),
		TRUE_HEADING: pgnEntry({
			title: "True Heading",
			pgns: "127250",
			sources: ["navigation.headingTrue"],
		}),
		LEEWAY: pgnEntry({
			title: "Leeway Angle",
			pgns: "128000",
			sources: ["navigation.leewayAngle"],
		}),
		SET_DRIFT: pgnEntry({
			title: "Set and Drift",
			pgns: "129291",
			sources: ["environment.current.setTrue", "environment.current.drift"],
		}),
		ATTITUDE: pgnEntry({
			title: "Vessel Attitude",
			pgns: "127257",
			sources: [
				"navigation.attitude.roll",
				"navigation.attitude.pitch",
				"navigation.attitude.yaw",
			],
		}),
		HEAVE: pgnEntry({
			title: "Vessel Heave",
			pgns: "127252",
			sources: ["navigation.heave"],
		}),
		DIRECTION_DATA: pgnEntry({
			title: "Direction Data",
			pgns: "130577",
			sources: [
				"navigation.courseOverGroundTrue",
				"navigation.courseOverGroundMagnetic",
				"navigation.headingTrue",
				"navigation.headingMagnetic",
			],
		}),
		GNSS_DOPS: pgnEntry({
			title: "GNSS DOPs",
			pgns: "129539",
			sources: [
				"navigation.gnss.horizontalDilution",
				"navigation.gnss.verticalDilution",
				"navigation.gnss.timeDilution",
				"navigation.gnss.mode",
			],
		}),
		GNSS_SATELLITES: pgnEntry({
			title: "GNSS Satellites",
			pgns: "129540",
			sources: [
				"navigation.gnss.satellitesInView.count",
				"navigation.gnss.satellitesInView.satellites",
			],
		}),
		AIS: pgnEntry({ title: "AIS", pgns: "129038, 129794, 129041" }),
		AIS_CLASS_B_POSITION: pgnEntry({
			title: "AIS Class B Position",
			pgns: "129039",
		}),
		AIS_CLASS_B_EXTENDED: pgnEntry({
			title: "AIS Class B Extended",
			pgns: "129040",
		}),
		CROSS_TRACK_ERROR: pgnEntry({
			title: "Cross Track Error",
			pgns: "129283",
			sources: ["navigation.course.calcValues.crossTrackError"],
		}),
		NAVIGATION_DATA: pgnEntry({
			title: "Navigation Data",
			pgns: "129284",
			sources: [
				"navigation.course.calcValues.distance",
				"navigation.course.calcValues.bearingTrue",
				"navigation.course.calcValues.bearingTrackTrue",
				"navigation.course.calcValues.velocityMadeGood",
			],
		}),
		BEARING_DISTANCE_MARKS: pgnEntry({
			title: "Bearing Distance Between Marks",
			pgns: "129302",
			sources: [
				"navigation.courseGreatCircle.nextPoint.bearingTrue",
				"navigation.course.nextPoint.bearingMagnetic",
				"navigation.magneticVariation",
				"navigation.course.nextPoint.distance",
				"navigation.course.nextPoint.type",
				"navigation.course.previousPoint.type",
			],
		}),
		ROUTE_WAYPOINT: pgnEntry({
			title: "Route and Waypoint Information",
			pgns: "129285",
			sources: [
				"navigation.course.nextPoint.position",
				"navigation.course.activeRoute.name",
				"navigation.course.activeRoute.waypoints",
			],
		}),
		TIME_TO_MARK: pgnEntry({
			title: "Time to Mark",
			pgns: "129301",
			sources: ["navigation.course.nextPoint.timeToGo"],
		}),
		WIND_TRUE_GROUND: pgnEntry({
			title: "Wind True Over Ground",
			pgns: "130306",
			sources: [
				"environment.wind.directionTrue",
				"environment.wind.speedOverGround",
			],
		}),
		WIND_TRUE: pgnEntry({
			title: "Wind True Over Water",
			pgns: "130306",
			sources: [
				"environment.wind.angleTrueWater",
				"environment.wind.speedTrue",
			],
		}),
		ENGINE_STATIC: pgnEntry({
			title: "Engine Configuration Parameters",
			pgns: "127498",
			sources: [
				"propulsion.main.ratedEngineSpeed",
				"propulsion.main.VIN",
				"propulsion.main.softwareVersion",
			],
		}),
		TRANSMISSION_PARAMETERS: pgnEntry({
			title: "Transmission Parameters",
			pgns: "127493",
			sources: [
				"propulsion.main.transmission.gearRatio",
				"propulsion.main.transmission.oilPressure",
				"propulsion.main.transmission.oilTemperature",
			],
		}),
		SMALL_CRAFT_STATUS: pgnEntry({
			title: "Small Craft Status",
			pgns: "130576",
			sources: ["steering.trimTab.port", "steering.trimTab.starboard"],
		}),
		NOTIFICATIONS: pgnEntry({
			title: "Notifications",
			pgns: "126983, 126985",
			extras: {
				excludePaths: {
					type: "string",
					title: "Exclude Paths",
					description:
						"Comma-separated list of notification path prefixes to ignore (e.g. notifications.sensors.AccessoryBattery,notifications.sensors.EngineBattery)",
					default: "",
				},
			},
		}),
		PRODUCT_INFO: pgnEntry({ title: "Product Information", pgns: "126996" }),
		DSC_CALLS: pgnEntry({ title: "DSC Call Information", pgns: "129808" }),
		RAYMARINE_ALARMS: pgnEntry({ title: "Raymarine Alarms", pgns: "65288" }),
		PGN_LIST: pgnEntry({ title: "PGN List", pgns: "126464" }),
		RADIO_FREQUENCY: pgnEntry({ title: "Radio Frequency", pgns: "129799" }),
		RAYMARINE_BRIGHTNESS: pgnEntry({
			title: "Raymarine Display Brightness",
			pgns: "126720",
			extras: {
				groups: arrayMapping("Brightness Groups", {
					signalkId: { title: "Signal K display group id", type: "string" },
					instanceId: {
						title: "Raymarine Display Group Label",
						description: "e.g. Helm 1, Helm 2, Cockpit",
						type: "string",
					},
				}),
			},
		}),
		EXHAUST_TEMPERATURE: pgnEntry({
			title: "Exhaust Temperature",
			pgns: "130312",
			extras: {
				engines: arrayMapping("Engine Mapping", {
					signalkId: { title: "Signal K engine id", type: "string" },
					tempInstanceId: {
						title: "NMEA2000 Temperature Instance Id",
						type: "number",
					},
				}),
			},
		}),
		AIS_SAR_AIRCRAFT: pgnEntry({
			title: "AIS SAR Aircraft Position",
			pgns: "129798",
		}),
		AIS_SAFETY_MESSAGE: pgnEntry({
			title: "AIS Safety Related Broadcast Message",
			pgns: "129802",
		}),
		NAVIGATION_DATA_GREAT_CIRCLE: pgnEntry({
			title: "Navigation Data (Great Circle)",
			pgns: "129284",
		}),
		ROUTE_WP_LIST: pgnEntry({ title: "Route/WP List", pgns: "130074" }),
	},
};
