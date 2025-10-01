import type {
  ConversionModule,
  ConversionCallback,
  SignalKApp,
  SignalKPlugin,
} from '../types/index.js'

/**
 * Wind conversion module - converts Signal K wind data to NMEA 2000 PGN 130306
 */
export default function createWindConversion(
  app: SignalKApp,
): ConversionModule<[number | null, number | null]> {
  return {
    title: 'Wind (130306)',
    optionKey: 'WIND',
    keys: ['environment.wind.angleApparent', 'environment.wind.speedApparent'],
    callback: ((angle: number | null, speed: number | null) => {
      try {
        if (angle === null && speed === null) {
          return []
        }

        // Convert negative angles to positive (0-2π range)
        const normalizedAngle = angle !== null && angle < 0 ? angle + Math.PI * 2 : angle

        return [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed: speed,
              windAngle: normalizedAngle,
              reference: 'Apparent',
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
        input: [2.0944, 1.2],
        expected: [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed: 1.2,
              windAngle: 2.0944,
              reference: 'Apparent',
            },
          },
        ],
      },
      {
        input: [-2.0944, 1.5],
        expected: [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed: 1.5,
              windAngle: 4.1887902047863905,
              reference: 'Apparent',
            },
          },
        ],
      },
      {
        // Test with null values
        input: [null, 0],
        expected: [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed: 0,
              windAngle: null,
              reference: 'Apparent',
            },
          },
        ],
      },
    ],
  }
}
