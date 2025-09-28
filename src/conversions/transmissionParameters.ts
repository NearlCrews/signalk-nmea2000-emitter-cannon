import type { ConversionModule, N2KMessage } from '../types/index.js';

export default function createTransmissionParametersConversion(): ConversionModule {
  return {
    title: "Transmission Parameters (127493)",
    optionKey: "TRANSMISSION_PARAMETERS",
    keys: [
      "propulsion.main.transmission.gearRatio",
      "propulsion.main.transmission.oilPressure",
      "propulsion.main.transmission.oilTemperature",
      "propulsion.main.transmission.discreteStatus1",
      "propulsion.main.transmission.discreteStatus2",
    ],
    timeouts: [10000, 10000, 10000, 10000, 10000], // 10 seconds
    callback: (
      gearRatio: unknown,
      oilPressure: unknown,
      oilTemperature: unknown,
      discreteStatus1: unknown,
      discreteStatus2: unknown
    ): N2KMessage[] => {
      if (gearRatio == null && oilPressure == null && oilTemperature == null) {
        return [];
      }

      // Determine transmission gear based on gear ratio
      let transmissionGear = "Neutral";
      if (typeof gearRatio === 'number') {
        if (gearRatio > 1) {
          transmissionGear = "Forward";
        } else if (gearRatio < 0) {
          transmissionGear = "Reverse";
        } else {
          transmissionGear = "Neutral";
        }
      }

      return [
        {
          prio: 2,
          pgn: 127493,
          dst: 255,
          fields: {
            engineInstance: 0,
            transmissionGear,
            oilPressure: typeof oilPressure === 'number' ? oilPressure : undefined,
            oilTemperature: typeof oilTemperature === 'number' ? oilTemperature : undefined,
            discreteStatus1: typeof discreteStatus1 === 'number' ? discreteStatus1 : 0,
            discreteStatus2: typeof discreteStatus2 === 'number' ? discreteStatus2 : 0,
          },
        },
      ];
    },
    tests: [
      {
        input: [2.5, 345000, 353.15, 0, 0], // Forward gear, oil pressure in Pa, temp in K
        expected: [
          {
            prio: 2,
            pgn: 127493,
            dst: 255,
            fields: {
              engineInstance: 0,
              transmissionGear: "Forward",
              oilPressure: 345000,
              oilTemperature: 353.15,
              discreteStatus1: 0,
              discreteStatus2: 0,
            },
          },
        ],
      },
      {
        input: [-1.5, 320000, 343.15, 1, 0], // Reverse gear
        expected: [
          {
            prio: 2,
            pgn: 127493,
            dst: 255,
            fields: {
              engineInstance: 0,
              transmissionGear: "Reverse",
              oilPressure: 320000,
              oilTemperature: 343.15,
              discreteStatus1: 1,
              discreteStatus2: 0,
            },
          },
        ],
      },
    ],
  };
}
