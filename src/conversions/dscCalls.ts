import type { ConversionModule, N2KMessage } from '../types/index.js';

interface Position {
  latitude?: number;
  longitude?: number;
}

export default function createDscCallsConversion(): ConversionModule {
  return {
    title: "DSC Call Information (129808)",
    optionKey: "DSC_CALLS",
    keys: [
      "communication.dsc.callType",
      "communication.dsc.mmsi",
      "communication.dsc.nature",
      "communication.dsc.position",
      "communication.dsc.workingFrequency",
      "communication.dsc.vesselInDistress",
      "communication.dsc.callTime",
    ],
    callback: (
      callType: unknown,
      mmsi: unknown,
      nature: unknown,
      position: unknown,
      workingFreq: unknown,
      vesselInDistress: unknown,
      _callTime: unknown
    ): N2KMessage[] => {
      // Send DSC call data if we have essential information
      if (!callType && !mmsi && !nature) {
        return [];
      }

      // Map call types to NMEA2000 format
      const callTypeMapping: Record<string, string> = {
        distress: "Distress",
        urgency: "Urgency",
        safety: "Safety",
        routine: "Routine Individual",
        group: "Group",
        all_ships: "All Ships",
        test: "Test",
      };

      // Map nature of distress
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

      const callTypeString = typeof callType === 'string' ? callType : '';
      const natureString = typeof nature === 'string' ? nature : '';
      const mmsiNumber = typeof mmsi === 'number' ? mmsi : 0;
      const vesselInDistressNumber = typeof vesselInDistress === 'number' ? vesselInDistress : mmsiNumber;

      // Handle frequency conversion
      let frequency = 0;
      if (typeof workingFreq === 'number') {
        frequency = workingFreq < 1000 ? workingFreq * 1000000 : workingFreq;
      }

      // Handle position - convert to compatible object
      const pos = (position as Position) || { latitude: 0, longitude: 0 };
      const positionObject = {
        latitude: pos.latitude || 0,
        longitude: pos.longitude || 0,
      };

      return [
        {
          prio: 2,
          pgn: 129808,
          dst: 255,
          fields: {
            dscFormatSymbol: callTypeMapping[callTypeString] || "Routine Individual",
            dscCategorySymbol:
              callTypeString === "distress"
                ? "Distress"
                : callTypeString === "urgency"
                  ? "Urgency"
                  : callTypeString === "safety"
                    ? "Safety"
                    : "Routine",
            dscMessageAddress: mmsiNumber,
            natureOfDistressOr1stTelecommand:
              distressMapping[natureString] || natureString || "Undesignated distress",
            subsequentCommunicationModeOr2ndTelecommand: "No information",
            proposedRxFrequencyChannel: frequency,
            position: positionObject,
            vesselInDistressMmsi: vesselInDistressNumber,
            dscEosSymbol: "Req Ack",
            expansionEnabled: "No",
            callingRxFrequencyChannel: frequency,
            callingTxFrequencyChannel: frequency,
          },
        },
      ];
    },
    tests: [
      {
        input: ["distress", 367123456, "fire", { latitude: 40.7128, longitude: -74.006 }, 16, 367123456, null],
        expected: [
          {
            prio: 2,
            pgn: 129808,
            dst: 255,
            fields: {
              dscFormatSymbol: "Distress",
              dscCategorySymbol: "Distress",
              dscMessageAddress: 367123456,
              natureOfDistressOr1stTelecommand: "Fire, explosion",
              subsequentCommunicationModeOr2ndTelecommand: "No information",
              proposedRxFrequencyChannel: 16000000,
              position: { latitude: 40.7128, longitude: -74.006 },
              vesselInDistressMmsi: 367123456,
              dscEosSymbol: "Req Ack",
              expansionEnabled: "No",
              callingRxFrequencyChannel: 16000000,
              callingTxFrequencyChannel: 16000000,
            },
          },
        ],
      },
    ],
  };
}
