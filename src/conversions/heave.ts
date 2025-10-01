import type {
  ConversionModule,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  ConversionCallback,
} from '../types/index.js'

/**
 * Heave conversion module - converts Signal K heave motion to NMEA 2000 PGN 127252
 */
export default function createHeaveConversion(
  app: SignalKApp,
): ConversionModule<[number | null]> {
  return {
    title: 'Heave (127252)',
    optionKey: 'HEAVE',
    keys: ['navigation.heave'],
    timeouts: [1000], // 1 second for responsive motion data
    callback: ((heave: number | null) => {
      try {
        // Validate heave input - required field
        if (typeof heave !== 'number') {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 127252,
            dst: 255,
            fields: {
              sid: 0,
              heave,
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
        input: [0.15], // 15cm heave up
        expected: [
          {
            prio: 2,
            pgn: 127252,
            dst: 255,
            fields: {
              sid: 0,
              heave: 0.15,
            },
          },
        ],
      },
      {
        input: [-0.08], // 8cm heave down
        expected: [
          {
            prio: 2,
            pgn: 127252,
            dst: 255,
            fields: {
              sid: 0,
              heave: -0.08,
            },
          },
        ],
      },
    ],
  }
}
