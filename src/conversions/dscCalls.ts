import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { parseMmsi } from "../utils/aisUtils.js";

// communication.dsc.callType maps to PGN 129808 dscFormat, a DSC_FORMAT
// LOOKUP value naming who the call addresses (not its priority). Only these
// three callTypes imply a specific format; routine/urgency/safety/test
// address an individual station, the default below. The call priority
// (routine/safety/urgency/distress) is the separate dscCategory field.
const callTypeToFormat: Record<string, string> = {
	distress: "Distress",
	group: "Common interest",
	all_ships: "All ships",
};

const dscCategoryMapping: Record<string, string> = {
	distress: "Distress",
	urgency: "Urgency",
	safety: "Safety",
};

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
		title: "DSC Call Information (PGN 129808)",
		optionKey: "DSC_CALLS",
		category: "comms",
		// communication.dsc.* is not part of the canonical Signal K v1 schema
		// (which has no top-level communication branch); it is a convention
		// used by DSC-aware upstream providers. Requires such a provider.
		keys: ["communication.dsc.callType", "communication.dsc.mmsi", "communication.dsc.nature"],
		callback: ((callType: string | null, mmsi: string | null, nature: string | null) => {
			if (!callType && !mmsi && !nature) {
				return [];
			}

			const callTypeString = callType || "";
			const natureString = nature || "";

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129808,
					dst: N2K_BROADCAST_DST,
					fields: {
						dscFormat: callTypeToFormat[callTypeString] ?? "Individual stations",
						// canboatjs 3.20 variant matching only encodes dscCategory for
						// the Distress variant; non-distress categories (Routine,
						// Safety, Urgency) drop to the "not available" sentinel on the
						// wire. The distress path encodes correctly. Tracked upstream.
						dscCategory: dscCategoryMapping[callTypeString] ?? "Routine",
						dscMessageAddress: parseMmsi(mmsi),
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
				input: ["distress", "367123456", "fire"],
				expected: [
					{
						prio: 2,
						pgn: 129808,
						dst: 255,
						fields: {
							dscFormat: "Distress",
							dscCategory: "Distress",
							dscMessageAddress: 367123456,
							mmsiOfShipInDistress: 4294967295,
							natureOfDistress: "Fire",
							subsequentCommunicationModeOr2ndTelecommand: "No information",
							list: [],
						},
					},
				],
			},
		],
	};
}
