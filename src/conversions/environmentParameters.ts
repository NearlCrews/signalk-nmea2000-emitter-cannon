import type {
  ConversionModule,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  ConversionCallback,
} from '../types/index.js'

/**
 * Environment Parameters conversion module - converts Signal K atmospheric pressure to NMEA 2000 PGN 130311
 */
export default function createEnvironmentParametersConversion(
  app: SignalKApp,
): ConversionModule<[number | null]> {
  return {
    title: 'Atmospheric Pressure (130311)',
    optionKey: 'ENVIRONMENT_PARAMETERS',
    keys: ['environment.outside.pressure'],
    callback: ((pressure: number | null) => {
      try {
        // Validate pressure input
        if (typeof pressure !== 'number') {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 130311,
            dst: 255,
            fields: {
              atmosphericPressure: pressure,
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
        input: [3507100],
        expected: [
          {
            prio: 2,
            pgn: 130311,
            dst: 255,
            fields: {
              atmosphericPressure: 3507100,
            },
          },
        ],
      },
    ],
  }
}
