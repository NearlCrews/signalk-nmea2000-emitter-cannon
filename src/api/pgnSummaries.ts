// One-line plain-language summary of each NMEA 2000 PGN the plugin emits.
// Rendered as a hover tooltip on each PGN number in a conversion card's
// title so an installer can tell what a message carries without consulting
// the spec. Keyed by PGN number. Verified against canboat's PGN definitions.
export const PGN_SUMMARIES: Record<number, string> = {
	65288:
		"Raymarine proprietary Seatalk alarm message: which alarm is active, its group, and priority",
	126464:
		"List of which NMEA 2000 messages this device sends and receives, used for network discovery",
	126720:
		"Raymarine proprietary message, used here to set display backlight brightness on Raymarine instruments",
	126983:
		"An active alarm or warning: its type, category, severity, and current acknowledged state",
	126985:
		"The plain-language text that goes with an alarm, so the chartplotter can show a readable message",
	126992: "Current date and time broadcast to the network, typically sourced from GPS",
	127245: "Rudder angle: where the rudder currently sits and the commanded angle from an autopilot",
	127250:
		"Vessel heading, the direction the boat is pointing, with magnetic deviation and variation",
	127251: "Rate of turn: how fast the vessel is swinging to port or starboard",
	127252: "Heave: the up-and-down vertical motion of the vessel in waves",
	127257: "Vessel attitude: pitch (bow up/down), roll (heel side to side), and yaw",
	127258: "Magnetic variation, the local difference between true north and magnetic north",
	127488: "Fast-updating engine data: RPM, turbo boost pressure, and engine tilt or trim",
	127489:
		"Detailed engine data: oil pressure and temperature, coolant temperature, fuel rate, engine hours, alerts",
	127493: "Transmission data: current gear, transmission oil pressure and temperature",
	127497: "Engine trip totals: fuel used, average fuel rate, and fuel economy for the trip",
	127498: "Fixed engine information: rated RPM, serial/VIN number, and software version",
	127505: "Tank level: how full a fuel, water, holding, or other tank is, plus its total capacity",
	127506: "Detailed battery status: state of charge, state of health, and estimated time remaining",
	127508: "Battery basics: voltage, current draw or charge, and battery temperature",
	128000: "Leeway angle: how far the boat is slipping sideways off its heading",
	128259: "Boat speed through the water and over the ground from the speed sensor",
	128267: "Water depth below the transducer, plus the configured keel or surface offset",
	129025: "Fast-updating GPS position: current latitude and longitude",
	129026: "Fast-updating course over ground and speed over ground from GPS",
	129029: "Full GPS fix: position, altitude, fix quality, satellites used, and accuracy figures",
	129038:
		"AIS position report from a nearby commercial (Class A) vessel: location, course, speed, heading",
	129039: "AIS position report from a nearby small-craft (Class B) vessel: location, course, speed",
	129040: "Extended AIS Class B report: a small vessel's position plus its name and size",
	129041: "AIS Aid to Navigation report: position and type of a buoy, beacon, or other marked aid",
	129283: "Cross track error: how far the boat has drifted off the active navigation route line",
	129284: "Navigation data for the active waypoint: distance, bearing, ETA, and arrival status",
	129285: "Details of the active route and its waypoints: names and positions being navigated",
	129291: "Set and drift: the speed and direction of the current pushing the vessel",
	129301: "Time to reach or time since passing a navigation mark",
	129302: "Bearing and distance from one mark to another",
	129539: "GPS accuracy figures (dilution of precision) showing how reliable the current fix is",
	129540:
		"GPS satellites currently in view, with each satellite's elevation, bearing, and signal strength",
	129794:
		"AIS static and voyage data for a Class A vessel: name, callsign, size, destination, draft",
	129798:
		"AIS position report from a search-and-rescue aircraft: location, course, speed, altitude",
	129799: "Radio frequency, channel, mode, and transmit power settings for a VHF or similar radio",
	129802: "AIS broadcast safety message: free text safety information sent to all nearby vessels",
	129808:
		"DSC distress and call information from a VHF radio: nature of distress, position, and MMSI",
	130074: "A list of waypoints with their names and positions, exchanged as part of route services",
	130306: "Wind data: wind speed and angle, either apparent or true depending on the reference",
	130310:
		"Legacy environmental message (now superseded): water temperature, air temperature, barometric pressure",
	130311:
		"Environmental data: temperature, humidity, and barometric pressure with their source types",
	130312:
		"Temperature reading from a specific sensor, such as sea, cabin, engine room, or refrigerator",
	130313: "Humidity reading from a specific sensor, inside or outside the vessel",
	130314: "Barometric or other pressure reading from a specific sensor",
	130316: "Temperature reading with a wider range than PGN 130312, the modern replacement for it",
	130576: "Small craft status: the current position of the port and starboard trim tabs",
	130577:
		"Direction data combining course and speed over ground with heading and speed through water",
};

// `pgn` is a string because ConversionMetadata.pgns is a string[] (derived
// from conversion titles); the map is keyed by number.
export function pgnSummaryFor(pgn: string): string | undefined {
	return PGN_SUMMARIES[Number(pgn)];
}
