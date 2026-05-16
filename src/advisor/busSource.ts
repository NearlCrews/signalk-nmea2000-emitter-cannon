// src/advisor/busSource.ts

// canboatjs labels NMEA 2000 sources as "<bus>.<address>" where the bus id
// commonly contains "can" and the address is numeric, e.g. "can0.123" or
// "n2k-on-ve.can-socket.45". The plugin's own AIS echo guard uses the bare
// label "NMEA2000". A source matching either form is data already on the
// bus, so a conversion for it would echo.
const N2K_BUS_LABEL = /(^|[.-])can([0-9.-]|$)/i;

/**
 * True when `label` is a Signal K `$source` produced by the NMEA 2000 bus
 * (so emitting a conversion for that path would duplicate bus traffic).
 */
export function isN2KSource(label: string): boolean {
	if (label === "") return false;
	if (label === "NMEA2000") return true;
	if (N2K_BUS_LABEL.test(label) && /\.\d+$/.test(label)) return true;
	return false;
}
