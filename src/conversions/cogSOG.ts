import type {
  ConversionModule,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  ConversionCallback,
} from '../types/index.js'

/**
 * COG & SOG conversion module - converts Signal K course and speed data to NMEA 2000 PGN 129026
 */
export default function createCogSogConversion(
  app: SignalKApp,
): ConversionModule<[number | null, number | null]> {
  return {
    title: 'COG & SOG (129026)',
    optionKey: 'COG_SOG',
    keys: ['navigation.courseOverGroundTrue', 'navigation.speedOverGround'],
    callback: ((course: number | null, speed: number | null) => {
      try {
        // Return empty array if both values are null
        if (course === null && speed === null) {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              cogReference: 'True',
              cog: course,
              sog: speed,
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
        input: [2.1, 9],
        expected: [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              cogReference: 'True',
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
              cogReference: 'True',
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
              cogReference: 'True',
              cog: 1.57,
            },
          },
        ],
      },
    ],
  }
}
