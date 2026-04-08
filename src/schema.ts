import type { JSONSchema } from "./types/index.js";

export const schema: JSONSchema = {
	type: "object",
	title: "Conversions to NMEA2000",
	description:
		"If there is SignalK data for the conversion generate the following NMEA2000 pgns from Signal K data:",
	properties: {
		WIND: {
			type: "object",
			title: "Wind",
			description: "PGNs: 130306",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentwindangleApparent: {
					title: "Source for environment.wind.angleApparent",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				environmentwindspeedApparent: {
					title: "Source for environment.wind.speedApparent",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentdepthbelowTransducer: {
					title: "Source for environment.depth.belowTransducer",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationcourseOverGroundTrue: {
					title: "Source for navigation.courseOverGroundTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationspeedOverGround: {
					title: "Source for navigation.speedOverGround",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationheadingMagnetic: {
					title: "Source for navigation.headingMagnetic",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationspeedThroughWater: {
					title: "Source for navigation.speedThroughWater",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				steeringrudderpositioning: {
					title: "Source for steering.rudder.position",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationposition: {
					title: "Source for navigation.position",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationgnssgeoidalSeparation: {
					title: "Source for navigation.gnss.geoidalSeparation",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationgnssmethod: {
					title: "Source for navigation.gnss.method",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationgnssnumberOfSatellites: {
					title: "Source for navigation.gnss.numberOfSatellites",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationgnsshorizontalDilution: {
					title: "Source for navigation.gnss.horizontalDilution",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
			},
		},
		TEMPERATURE_OUTSIDE: {
			type: "object",
			title: "Outside Temperature",
			description: "PGNs: 130312",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentoutsidetemperature: {
					title: "Source for environment.outside.temperature",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
			},
		},
		TEMPERATURE_INSIDE: {
			type: "object",
			title: "Inside Temperature",
			description: "PGNs: 130312",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentinsidetemperature: {
					title: "Source for environment.inside.temperature",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
			},
		},
		PRESSURE: {
			type: "object",
			title: "Atmospheric Pressure",
			description: "PGNs: 130314",
			properties: {
				enabled: { title: "Enabled", type: "boolean", default: false },
				resend: {
					type: "number",
					title: "Resend (seconds)",
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentoutsidepressure: {
					title: "Source for environment.outside.pressure",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentoutsidehumidity: {
					title: "Source for environment.outside.humidity",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentinsidehumidity: {
					title: "Source for environment.inside.humidity",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentwatertemperature: {
					title: "Source for environment.water.temperature",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				environmentoutsidetemperature: {
					title: "Source for environment.outside.temperature",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentoutsidepressure: {
					title: "Source for environment.outside.pressure",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationmagneticVariance: {
					title: "Source for navigation.magneticVariance",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationrateOfTurn: {
					title: "Source for navigation.rateOfTurn",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationheadingTrue: {
					title: "Source for navigation.headingTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				performanceleeway: {
					title: "Source for performance.leeway",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentcurrentsetTrue: {
					title: "Source for environment.current.setTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				environmentcurrentdrift: {
					title: "Source for environment.current.drift",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationattituderoll: {
					title: "Source for navigation.attitude.roll",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationattitudepitch: {
					title: "Source for navigation.attitude.pitch",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationattitudeyaw: {
					title: "Source for navigation.attitude.yaw",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationheave: {
					title: "Source for navigation.heave",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationcourseOverGroundTrue: {
					title: "Source for navigation.courseOverGroundTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcourseOverGroundMagnetic: {
					title: "Source for navigation.courseOverGroundMagnetic",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationheadingTrue: {
					title: "Source for navigation.headingTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationheadingMagnetic: {
					title: "Source for navigation.headingMagnetic",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcourseRhumblinenextPointbearingTrue: {
					title: "Source for navigation.courseRhumbline.nextPoint.bearingTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcourseRhumblinenextPointbearingMagnetic: {
					title:
						"Source for navigation.courseRhumbline.nextPoint.bearingMagnetic",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcourseGreatCirclenextPointbearingTrue: {
					title:
						"Source for navigation.courseGreatCircle.nextPoint.bearingTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcourseGreatCirclenextPointbearingMagnetic: {
					title:
						"Source for navigation.courseGreatCircle.nextPoint.bearingMagnetic",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationgnsshorizontalDilution: {
					title: "Source for navigation.gnss.horizontalDilution",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationgnssverticalDilution: {
					title: "Source for navigation.gnss.verticalDilution",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationgnsstitimeDilution: {
					title: "Source for navigation.gnss.timeDilution",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationgnssmode: {
					title: "Source for navigation.gnss.mode",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationgnsssatellitesInViewcount: {
					title: "Source for navigation.gnss.satellitesInView.count",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationgnsssatellitesInViewsatellites: {
					title: "Source for navigation.gnss.satellitesInView.satellites",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationcoursecalcValuescrossTrackError: {
					title: "Source for navigation.course.calcValues.crossTrackError",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationcoursecalcValuesdistance: {
					title: "Source for navigation.course.calcValues.distance",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcoursecalcValuesbearing: {
					title: "Source for navigation.course.calcValues.bearing",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcoursecalcValuesvelocityMadeGood: {
					title: "Source for navigation.course.calcValues.velocityMadeGood",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcoursecalcValueseta: {
					title: "Source for navigation.course.calcValues.eta",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationcoursenextPointbearingMagnetic: {
					title: "Source for navigation.course.nextPoint.bearingMagnetic",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcoursenextPointdistance: {
					title: "Source for navigation.course.nextPoint.distance",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationcoursenextPointposition: {
					title: "Source for navigation.course.nextPoint.position",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationcoursenextPointdistance: {
					title: "Source for navigation.course.nextPoint.distance",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				navigationcoursenextPointtimeToGo: {
					title: "Source for navigation.course.nextPoint.timeToGo",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentwinddirectionTrue: {
					title: "Source for environment.wind.directionTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				environmentwindspeedOverGround: {
					title: "Source for environment.wind.speedOverGround",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				environmentwindangleTrueWater: {
					title: "Source for environment.wind.angleTrueWater",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				environmentwindspeedTrue: {
					title: "Source for environment.wind.speedTrue",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				propulsionmainratedEngineSpeed: {
					title: "Source for propulsion.main.ratedEngineSpeed",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				propulsionmainengineoperatingHours: {
					title: "Source for propulsion.main.engine.operatingHours",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				propulsionmaintransmissiongearRatio: {
					title: "Source for propulsion.main.transmission.gearRatio",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				propulsionmaintransmissionoilPressure: {
					title: "Source for propulsion.main.transmission.oilPressure",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				propulsionmaintransmissionoilTemperature: {
					title: "Source for propulsion.main.transmission.oilTemperature",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
				steeringtrimTabport: {
					title: "Source for steering.trimTab.port",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				steeringtrimTabstarboard: {
					title: "Source for steering.trimTab.starboard",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				environmentdepthbelowTransducer: {
					title: "Source for environment.depth.belowTransducer",
					description:
						"Use data only from this source (leave blank to ignore source)",
					type: "string",
				},
				navigationspeedOverGround: {
					title: "Source for navigation.speedOverGround",
					description:
						"Use data only from this source (leave blank to ignore source)",
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
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
					description: "If non-zero, the msg will be periodically resent",
					default: 5,
				},
				resendTime: {
					type: "number",
					title: "Resend Duration (seconds)",
					description:
						"The value will be resent for the given number of seconds",
					default: 30,
				},
			},
		},
	},
};
