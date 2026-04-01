import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY, N2K_DEFAULT_SID } from "../constants.js";
import type { ConversionCallback, ConversionModule, SignalKApp } from "../types/index.js";
import { toValidNumber } from "../utils/validation.js";

/**
 * COG & SOG conversion module - converts Signal K course and speed data to NMEA 2000 PGN 129026
 */
export default function createCogSogConversion(
  app: SignalKApp
): ConversionModule<[number | null, number | null]> {
  return {
    title: "COG & SOG (129026)",
    optionKey: "COG_SOG",
    keys: ["navigation.courseOverGroundTrue", "navigation.speedOverGround"],
    callback: ((course: number | null, speed: number | null) => {
      try {
        // Validate inputs (reject NaN/Infinity)
        const validCourse = toValidNumber(course);
        const validSpeed = toValidNumber(speed);

        // Return empty array if both values are null/invalid
        if (validCourse === null && validSpeed === null) {
          return [];
        }

        return [
          {
            prio: N2K_DEFAULT_PRIORITY,
            pgn: 129026,
            dst: N2K_BROADCAST_DST,
            fields: {
              sid: N2K_DEFAULT_SID,
              cogReference: "True",
              cog: validCourse,
              sog: validSpeed,
            },
          },
        ];
      } catch (err) {
        app.error(err instanceof Error ? err.message : String(err));
        return [];
      }
    }) as ConversionCallback<[number | null, number | null]>,

    tests: [
      {
        input: [2.1, 9],
        expected: [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              sid: 87,
              cogReference: "True",
              cog: 2.1,
              sog: 9,
            },
          },
        ],
      },
      {
        // Test with null course
        input: [null, 5.5],
        expected: [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              sid: 87,
              cogReference: "True",
              sog: 5.5,
            },
          },
        ],
      },
      {
        // Test with null speed
        input: [1.57, null],
        expected: [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              sid: 87,
              cogReference: "True",
              cog: 1.57,
            },
          },
        ],
      },
    ],
  };
}
