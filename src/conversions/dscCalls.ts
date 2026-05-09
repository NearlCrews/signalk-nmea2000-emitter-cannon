import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	SignalKApp,
} from "../types/index.js";

const callTypeMapping: Record<string, string> = {
	distress: "Distress",
	urgency: "Urgency",
	safety: "Safety",
	routine: "Routine Individual",
	group: "Group",
	all_ships: "All Ships",
	test: "Test",
};

const dscCategoryMapping: Record<string, string> = {
	distress: "Distress",
	urgency: "Urgency",
	safety: "Safety",
};

const distressMapping: Record<string, string> = {
	fire: "Fire, explosion",
	flooding: "Flooding",
	collision: "Collision",
	grounding: "Grounding",
	listing: "Listing, in danger of capsizing",
	sinking: "Sinking",
	disabled: "Disabled and adrift",
	abandoning: "Abandoning ship",
	piracy: "Piracy/armed robbery attack",
	man_overboard: "Man overboard",
	undesignated: "Undesignated distress",
};

type DscInputs = [string | null, number | null, string | null];

export default function createDscCallsConversion(
	_app: SignalKApp,
): ConversionModule<DscInputs> {
	return {
		title: "DSC Call Information (129808)",
		optionKey: "DSC_CALLS",
		keys: [
			"communication.dsc.callType",
			"communication.dsc.mmsi",
			"communication.dsc.nature",
		],
		callback: ((
			callType: string | null,
			mmsi: number | null,
			nature: string | null,
		) => {
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
						dscFormat: callTypeMapping[callTypeString] || "Routine Individual",
						dscCategory: dscCategoryMapping[callTypeString] ?? "Routine",
						dscMessageAddress: mmsi ?? 0,
						natureOfDistress:
							distressMapping[natureString] ||
							natureString ||
							"Undesignated distress",
						subsequentCommunicationModeOr2ndTelecommand: "No information",
						proposedTxFrequencyChannel: "",
						telephoneNumber: "",
						list: [],
					},
				},
			];
		}) as ConversionCallback<DscInputs>,
		tests: [
			{
				input: ["distress", 367123456, "fire"],
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
							natureOfDistress: 0,
							subsequentCommunicationModeOr2ndTelecommand: "No information",
							list: [],
						},
					},
				],
			},
		],
	};
}
