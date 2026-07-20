import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { encodeDscMmsi } from "../utils/aisUtils.js";

// Maps SK distress nature codes to canboat DSC_NATURE enum names exactly.
const distressMapping: Record<string, string> = {
	fire: "Fire",
	flooding: "Flooding",
	collision: "Collision",
	grounding: "Grounding",
	listing: "Listing",
	sinking: "Sinking",
	disabled: "Disabled and adrift",
	abandoning: "Abandoning ship",
	piracy: "Piracy",
	man_overboard: "Man overboard",
	epirb: "EPIRB emission",
	undesignated: "Undesignated",
};

type DscInputs = [string | null, string | null, string | null];

export default function createDscCallsConversion(_app: SignalKApp): ConversionModule<DscInputs> {
	return {
		title: "DSC Distress Call Information (PGN 129808)",
		optionKey: "DSC_CALLS",
		category: "comms",
		// communication.dsc.* is not part of the canonical Signal K v1 schema
		// (which has no top-level communication branch); it is a convention
		// used by DSC-aware upstream providers. Requires such a provider.
		keys: ["communication.dsc.callType", "communication.dsc.mmsi", "communication.dsc.nature"],
		callback: ((callType: string | null, mmsi: string | null, nature: string | null) => {
			// canboatjs 3.20 only selects a correctly encodable variant for
			// distress calls. Suppress all other categories instead of emitting a
			// plausible-looking frame whose category is lost on the wire.
			if (callType !== "distress") {
				return [];
			}

			const distressMmsi = encodeDscMmsi(mmsi);
			if (distressMmsi === undefined) return [];

			const natureString = nature || "";

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129808,
					dst: N2K_BROADCAST_DST,
					fields: {
						dscFormat: "Distress",
						dscCategory: "Distress",
						// DSC technical corrigendum Field 12. For a direct distress
						// call, Field 3 stays unavailable and the ship MMSI belongs here.
						mmsiOfShipInDistress: distressMmsi,
						natureOfDistress: distressMapping[natureString] ?? "Undesignated",
						subsequentCommunicationModeOr2ndTelecommand: "No information",
						// Emit the optional/repeating fields explicitly (empty channel,
						// phone, and list) so the frame carries the full PGN 129808
						// shape. canboatjs 3.20 variant matching for this PGN is
						// presence-sensitive (see the dscCategory note above), so these
						// are not safe to omit even though they are empty.
						proposedTxFrequencyChannel: "",
						telephoneNumber: "",
						list: [],
					},
				},
			];
		}) as ConversionCallback<DscInputs>,
		tests: [
			{
				input: ["routine", "367123456", null],
				expected: [],
			},
			{
				input: ["distress", "367123456junk", "fire"],
				expected: [],
			},
		],
	};
}
