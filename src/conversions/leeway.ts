import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Leeway conversion module - converts Signal K leeway angle to NMEA 2000 PGN 128000
 */
export default function createLeewayConversion(): ConversionModule {
  return {
    title: "Leeway (128000)",
    optionKey: "LEEWAY",
    keys: ["performance.leeway"],
    callback: (leeway: unknown): N2KMessage[] => {
      try {
        // Validate leeway input - required field
        if (typeof leeway !== 'number') {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 128000,
            dst: 255,
            fields: {
              leewayAngle: leeway,
            },
          },
        ]
      } catch (err) {
        console.error('Error in leeway conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [0.24],
        expected: [
          {
            prio: 2,
            pgn: 128000,
            dst: 255,
            fields: {
              leewayAngle: 0.24,
            },
          },
        ],
      },
    ],
  }
}
