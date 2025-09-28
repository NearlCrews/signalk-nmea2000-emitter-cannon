import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Set/Drift conversion module - converts Signal K current data to NMEA 2000 PGN 129291
 */
export default function createSetDriftConversion(): ConversionModule {
  return {
    title: "Set/Drift (129291)",
    optionKey: "SET_DRIFT",
    keys: ["environment.current.setTrue", "environment.current.drift"],
    callback: (set: unknown, drift: unknown): N2KMessage[] => {
      try {
        // Validate inputs - both set and drift should be numbers
        const setValue = typeof set === 'number' ? set : null
        const driftValue = typeof drift === 'number' ? drift : null

        // Return empty array if no current data available
        if (setValue === null && driftValue === null) {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 129291,
            dst: 255,
            fields: {
              set: setValue,
              drift: driftValue,
              setReference: "True",
            },
          },
        ]
      } catch (err) {
        console.error('Error in set/drift conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [2.0944, 1.2],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 2,
            fields: {
              drift: 1.2,
              set: 2.0944,
              setReference: "True",
            },
          },
        ],
      },
      {
        input: [1.0944, 1.5],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 2,
            fields: {
              drift: 1.5,
              set: 1.0944,
              setReference: "True",
            },
          },
        ],
      },
    ],
  }
}
