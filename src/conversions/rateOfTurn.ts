import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";

/**
 * Rate of Turn conversion module - converts Signal K rate of turn to NMEA 2000 PGN 127251
 */
export default function createRateOfTurnConversion(app: SignalKApp): ConversionModule {
  return {
    title: "Rate of Turn (127251)",
    optionKey: "RATE_OF_TURN",
    keys: ["navigation.rateOfTurn"],
    callback: (rateOfTurn: unknown): N2KMessage[] => {
      try {
        // Validate rate of turn input - required field
        if (typeof rateOfTurn !== "number") {
          return [];
        }

        return [
          {
            prio: N2K_DEFAULT_PRIORITY,
            pgn: 127251,
            dst: N2K_BROADCAST_DST,
            fields: {
              sid: 0,
              rate: rateOfTurn, // Rate of turn in rad/s
            },
          },
        ];
      } catch (err) {
        app.error(err instanceof Error ? err.message : String(err));
        return [];
      }
    },

    tests: [
      {
        input: [0.0175], // 1 degree per second
        expected: [
          {
            prio: 2,
            pgn: 127251,
            dst: 255,
            fields: {
              sid: 0,
              rate: 0.0175,
            },
          },
        ],
      },
      {
        input: [-0.0349], // 2 degrees per second, port turn
        expected: [
          {
            prio: 2,
            pgn: 127251,
            dst: 255,
            fields: {
              sid: 0,
              rate: -0.0349,
            },
          },
        ],
      },
    ],
  };
}
