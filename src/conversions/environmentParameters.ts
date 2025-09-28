import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Environment Parameters conversion module - converts Signal K atmospheric pressure to NMEA 2000 PGN 130311
 */
export default function createEnvironmentParametersConversion(): ConversionModule {
  return {
    title: "Atmospheric Pressure (130311)",
    optionKey: "ENVIRONMENT_PARAMETERS",
    keys: ["environment.outside.pressure"],
    callback: (pressure: unknown): N2KMessage[] => {
      try {
        // Validate pressure input
        if (typeof pressure !== 'number') {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 130311,
            dst: 255,
            fields: {
              atmosphericPressure: pressure,
            },
          },
        ]
      } catch (err) {
        console.error('Error in environment parameters conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [3507100],
        expected: [
          {
            prio: 2,
            pgn: 130311,
            dst: 255,
            fields: {
              atmosphericPressure: 3507100,
            },
          },
        ],
      },
    ],
  }
}
