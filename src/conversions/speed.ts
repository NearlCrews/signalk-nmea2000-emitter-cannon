import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_DEFAULT_SID } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";
import { isValidNumber } from "../utils/validation.js";

/**
 * Speed conversion module - converts Signal K speed through water to NMEA 2000 PGN 128259
 */
export default function createSpeedConversion(app: SignalKApp): ConversionModule {
  return {
    title: "Speed (128259)",
    optionKey: "SPEED",
    keys: ["navigation.speedThroughWater"],
    callback: (speed: unknown): N2KMessage[] => {
      try {
        // Validate input (reject non-numbers, NaN, and Infinity)
        if (!isValidNumber(speed)) {
          return [];
        }

        return [
          {
            prio: N2K_DEFAULT_PRIORITY,
            pgn: 128259,
            dst: N2K_BROADCAST_DST,
            fields: {
              sid: N2K_DEFAULT_SID,
              speedWaterReferenced: speed,
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
        input: [3],
        expected: [
          {
            prio: 2,
            pgn: 128259,
            dst: 255,
            fields: {
              sid: 87,
              speedWaterReferenced: 3,
            },
          },
        ],
      },
      {
        // Test with decimal speed
        input: [2.5],
        expected: [
          {
            prio: 2,
            pgn: 128259,
            dst: 255,
            fields: {
              sid: 87,
              speedWaterReferenced: 2.5,
            },
          },
        ],
      },
      {
        // Test with zero speed
        input: [0],
        expected: [
          {
            prio: 2,
            pgn: 128259,
            dst: 255,
            fields: {
              sid: 87,
              speedWaterReferenced: 0,
            },
          },
        ],
      },
    ],
  };
}
