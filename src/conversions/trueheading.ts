import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * True Heading conversion module - converts Signal K true heading to NMEA 2000 PGN 127250
 */
export default function createTrueHeadingConversion(): ConversionModule {
  return {
    title: "TrueHeading (127250)",
    optionKey: "TRUE_HEADING",
    keys: ["navigation.headingTrue"],
    callback: (heading: unknown): N2KMessage[] => {
      try {
        // Validate heading input - required field
        if (typeof heading !== 'number') {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              sid: 87,
              heading,
              variation: undefined,
              reference: "True",
            },
          },
        ]
      } catch (err) {
        console.error('Error in true heading conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [1.35, undefined],
        expected: [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              sid: 87,
              heading: 1.35,
              reference: "True",
            },
          },
        ],
      },
    ],
  }
}
