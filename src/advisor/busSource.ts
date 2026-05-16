// A Signal K `$source` for data already on the NMEA 2000 bus has the form
// `<connection-id>.<n2k-address>`, where the address is the numeric N2K
// source address (0-251), e.g. `can0.35`, `ttyUSB0.115`, `actisense.15`.
// The connection id is operator-named and arbitrary (it need not contain
// "can"), so the only label-level marker is the trailing `.<digits>`. The
// plugin's own AIS echo guard uses the bare label `NMEA2000`.
//
// The check errs toward classifying a source as N2K: a false positive only
// suppresses a recommendation, while a false negative would recommend a
// conversion that echoes bus data straight back onto the bus. NMEA 0183
// sources end in a letter talker id (`ttyUSB0.GP`), so they do not match.
const N2K_ADDRESS_SUFFIX = /\.\d+$/;

/**
 * True when `label` is a Signal K `$source` produced by the NMEA 2000 bus
 * (so emitting a conversion for that path would duplicate bus traffic).
 */
export function isN2KSource(label: string): boolean {
	if (label === "") return false;
	if (label === "NMEA2000") return true;
	return N2K_ADDRESS_SUFFIX.test(label);
}
