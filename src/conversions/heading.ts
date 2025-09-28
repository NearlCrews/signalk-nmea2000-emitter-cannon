import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Heading conversion module - converts Signal K heading and magnetic variation to NMEA 2000 PGN 127250
 */
export default function createHeadingConversion(): ConversionModule {
  return {
    title: "Heading (127250)",
    optionKey: "HEADING",
    keys: ["navigation.headingMagnetic", "navigation.magneticVariation"],
    callback: (heading: unknown, variation: unknown): N2KMessage[] => {
      try {
        // Validate inputs - convert to numbers or null
        const headingValue = typeof heading === 'number' ? heading : null
        const variationValue = typeof variation === 'number' ? variation : null

        // Return empty array if no heading data available
        if (headingValue === null) {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              sid: 87,
              heading: headingValue,
              variation: variationValue,
              reference: "Magnetic",
            },
          },
        ]
      } catch (err) {
        console.error('Error in heading conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [1.2, 0.7],
        expected: [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              sid: 87,
              heading: 1.2,
              variation: 0.7,
              reference: "Magnetic",
            },
          },
        ],
      },
      {
        // Test with null variation
        input: [2.5, null],
        expected: [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              sid: 87,
              heading: 2.5,
              reference: "Magnetic",
            },
          },
        ],
      },
      {
        // Test with zero heading
        input: [0, 0.1],
        expected: [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              sid: 87,
              heading: 0,
              variation: 0.1,
              reference: "Magnetic",
            },
          },
        ],
      },
    ],
  }
}
