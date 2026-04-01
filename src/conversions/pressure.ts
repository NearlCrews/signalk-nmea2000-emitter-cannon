import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";

/**
 * Create a pressure message for NMEA 2000
 */
function createPressureMessage(pressure: number, source: string): N2KMessage[] {
  return [
    {
      prio: N2K_DEFAULT_PRIORITY,
      pgn: 130314,
      dst: N2K_BROADCAST_DST,
      fields: {
        instance: 100,
        source,
        pressure,
      },
    },
  ];
}

/**
 * Pressure conversion modules - converts Signal K pressure data to NMEA 2000 PGN 130314
 */
export default function createPressureConversions(app: SignalKApp): ConversionModule[] {
  return [
    {
      title: "Atmospheric Pressure (130314)",
      optionKey: "PRESSURE",
      keys: ["environment.outside.pressure"],
      callback: (pressure: unknown): N2KMessage[] => {
        try {
          if (typeof pressure !== "number") {
            return [];
          }

          return createPressureMessage(pressure, "Atmospheric");
        } catch (err) {
          app.error(err instanceof Error ? err.message : String(err));
          return [];
        }
      },

      tests: [
        {
          input: [103047.8],
          expected: [
            {
              prio: 2,
              pgn: 130314,
              dst: 255,
              fields: {
                instance: 100,
                source: "Atmospheric",
                pressure: 103047.8,
              },
            },
          ],
        },
        {
          // Test with standard sea level pressure
          input: [101325],
          expected: [
            {
              prio: 2,
              pgn: 130314,
              dst: 255,
              fields: {
                instance: 100,
                source: "Atmospheric",
                pressure: 101325,
              },
            },
          ],
        },
        {
          // Test with low pressure
          input: [98000],
          expected: [
            {
              prio: 2,
              pgn: 130314,
              dst: 255,
              fields: {
                instance: 100,
                source: "Atmospheric",
                pressure: 98000,
              },
            },
          ],
        },
      ],
    },
  ];
}
