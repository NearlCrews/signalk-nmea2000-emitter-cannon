import type { SignalKApp } from "../types/index.js";

/**
 * Per-fix sequence identifier shared by the GNSS PGN family.
 *
 * NMEA 2000 uses the SID to tie together the PGNs that describe one sample
 * instant: PGN 129029 (position), 129026 (COG and SOG), 129539 (DOPs), and
 * 129540 (satellites) from the same fix carry the same SID, and the next fix
 * carries the next one. Valid data values are 0 to 252, wrapping; 255 means
 * "not available". A constant SID tells a receiver that every frame belongs to
 * the same, never-ending fix, which Garmin GNX and GMI instruments render as
 * a position that keeps flickering.
 *
 * Signal K does not expose the receiver's fix epoch, so the fix boundary is
 * inferred from the position stream: a new position, or the same position
 * arriving at least FIX_MERGE_MS after the last advance (a stationary boat),
 * starts a new fix. The repeated position that an NMEA 0183 receiver sends in
 * RMC and GGA for one fix lands inside the merge window with identical
 * coordinates, so both map to one SID.
 */
export const N2K_SID_MAX = 252;
export const N2K_SID_NOT_AVAILABLE = 255;
const FIX_MERGE_MS = 500;
// A fix older than this no longer describes "now": a COG/SOG frame from a
// different source must not claim to share a fix with a GNSS that went quiet.
const FIX_STALE_MS = 3000;

export class GnssFixSid {
	private sid = -1;
	private lastLatitude: number | undefined;
	private lastLongitude: number | undefined;
	private lastAdvanceMs = 0;

	/**
	 * Record a position sample and return the SID of the fix it belongs to.
	 */
	advance(latitude: number, longitude: number, now: number = Date.now()): number {
		const samePosition = latitude === this.lastLatitude && longitude === this.lastLongitude;
		if (this.sid < 0 || !samePosition || now - this.lastAdvanceMs >= FIX_MERGE_MS) {
			this.sid = (this.sid + 1) % (N2K_SID_MAX + 1);
			this.lastAdvanceMs = now;
		}
		this.lastLatitude = latitude;
		this.lastLongitude = longitude;
		return this.sid;
	}

	/**
	 * The SID of the latest fix, or 255 ("not available") when no fix has been
	 * seen yet or the last one is stale.
	 */
	current(now: number = Date.now()): number {
		if (this.sid < 0 || now - this.lastAdvanceMs > FIX_STALE_MS) {
			return N2K_SID_NOT_AVAILABLE;
		}
		return this.sid;
	}
}

const sequencers = new WeakMap<object, GnssFixSid>();

/**
 * The sequencer shared by every GNSS conversion built for this app. Factories
 * capture it at construction, so one `createConversionModules` call yields one
 * shared counter.
 */
export function gnssFixSidFor(app: SignalKApp): GnssFixSid {
	let sequencer = sequencers.get(app);
	if (sequencer === undefined) {
		sequencer = new GnssFixSid();
		sequencers.set(app, sequencer);
	}
	return sequencer;
}

/**
 * Start a fresh sequencer for the next set of conversion modules. Modules
 * already built keep the instance they captured.
 */
export function resetGnssFixSid(app: SignalKApp): void {
	sequencers.set(app, new GnssFixSid());
}
