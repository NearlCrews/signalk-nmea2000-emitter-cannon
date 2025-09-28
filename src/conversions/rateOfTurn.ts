import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Rate of Turn conversion module - converts Signal K rate of turn to NMEA 2000 PGN 127251
 */
export default function createRateOfTurnConversion(): ConversionModule {
  return {
    title: "Rate of Turn (127251)",
    optionKey: "RATE_OF_TURN",
    keys: ["navigation.rateOfTurn"],
    callback: (rateOfTurn: unknown): N2KMessage[] => {
      try {
        // Validate rate of turn input - required field
        if (typeof rateOfTurn !== 'number') {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 127251,
            dst: 255,
            fields: {
              sid: 0,
              rate: rateOfTurn, // Rate of turn in rad/s
              reserved: 16777215,
            },
          },
        ]
      } catch (err) {
        console.error('Error in rate of turn conversion:', err)
        return []
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
              reserved: 16777215,
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
              reserved: 16777215,
            },
          },
        ],
      },
    ],
  }
}
