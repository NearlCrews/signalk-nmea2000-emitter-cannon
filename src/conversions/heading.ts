import type {
  ConversionModule,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  ConversionCallback,
} from '../types/index.js'

/**
 * Heading conversion module - converts Signal K heading and magnetic variation to NMEA 2000 PGN 127250
 */
export default function createHeadingConversion(
  app: SignalKApp,
): ConversionModule<[number | null, number | null]> {
  return {
    title: 'Heading (127250)',
    optionKey: 'HEADING',
    keys: ['navigation.headingMagnetic', 'navigation.magneticVariation'],
    callback: ((heading: number | null, variation: number | null) => {
      try {
        // Return empty array if no heading data available
        if (heading === null) {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              sid: 87,
              heading: heading,
              variation: variation,
              reference: 'Magnetic',
            },
          },
        ]
      } catch (err) {
        app.error(err as Error)
        return []
      }
    }) as ConversionCallback<[number | null, number | null]>,

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
              reference: 'Magnetic',
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
              reference: 'Magnetic',
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
              reference: 'Magnetic',
            },
          },
        ],
      },
    ],
  }
}
