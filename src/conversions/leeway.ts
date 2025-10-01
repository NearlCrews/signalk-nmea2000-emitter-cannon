import type {
  ConversionModule,
  SignalKApp,
  ConversionCallback,
} from '../types/index.js'

/**
 * Leeway conversion module - converts Signal K leeway angle to NMEA 2000 PGN 128000
 */
export default function createLeewayConversion(
  app: SignalKApp,
): ConversionModule<[number | null]> {
  return {
    title: 'Leeway (128000)',
    optionKey: 'LEEWAY',
    keys: ['performance.leeway'],
    callback: ((leeway: number | null) => {
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
        app.error(err as Error)
        return []
      }
    }) as ConversionCallback<[number | null]>,

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
      {
        input: [-0.15], // Negative leeway
        expected: [
          {
            prio: 2,
            pgn: 128000,
            dst: 255,
            fields: {
              leewayAngle: -0.15,
            },
          },
        ],
      },
    ],
  }
}
