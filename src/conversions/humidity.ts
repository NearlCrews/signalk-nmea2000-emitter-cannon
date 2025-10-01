import type {
  ConversionModule,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  ConversionCallback,
} from '../types/index.js'

/**
 * Create a humidity message for NMEA 2000
 */
function createHumidityMessage(humidity: number, source: string): N2KMessage[] {
  return [
    {
      prio: 2,
      pgn: 130313,
      dst: 255,
      fields: {
        instance: 100,
        source,
        actualHumidity: humidity,
      },
    },
  ]
}

/**
 * Humidity conversion modules - converts Signal K humidity data to NMEA 2000 PGN 130313
 */
export default function createHumidityConversions(
  app: SignalKApp,
): ConversionModule<any>[] {
  return [
    {
      title: 'Outside Humidity (130313)',
      optionKey: 'HUMIDITY_OUTSIDE',
      keys: ['environment.outside.relativeHumidity'],
      callback: ((humidity: number | null) => {
        try {
          if (typeof humidity !== 'number') {
            return []
          }

          return createHumidityMessage(humidity, 'Outside')
        } catch (err) {
          app.error(err as Error)
          return []
        }
      }) as ConversionCallback<[number | null]>,

      tests: [
        {
          input: [0.5],
          expected: [
            {
              prio: 2,
              pgn: 130313,
              dst: 255,
              fields: {
                instance: 100,
                source: 'Outside',
                actualHumidity: 0.5,
              },
            },
          ],
        },
        {
          // Test with high humidity
          input: [0.95],
          expected: [
            {
              prio: 2,
              pgn: 130313,
              dst: 255,
              fields: {
                instance: 100,
                source: 'Outside',
                actualHumidity: 0.948,
              },
            },
          ],
        },
      ],
    },
    {
      title: 'Inside Humidity (130313)',
      optionKey: 'HUMIDITY_INSIDE',
      keys: ['environment.inside.relativeHumidity'],
      callback: ((humidity: number | null) => {
        try {
          if (typeof humidity !== 'number') {
            return []
          }

          return createHumidityMessage(humidity, 'Inside')
        } catch (err) {
          app.error(err as Error)
          return []
        }
      }) as ConversionCallback<[number | null]>,

      tests: [
        {
          input: [1.0],
          expected: [
            {
              prio: 2,
              pgn: 130313,
              dst: 255,
              fields: {
                instance: 100,
                source: 'Inside',
                actualHumidity: 1.0,
              },
            },
          ],
        },
        {
          // Test with low humidity
          input: [0.35],
          expected: [
            {
              prio: 2,
              pgn: 130313,
              dst: 255,
              fields: {
                instance: 100,
                source: 'Inside',
                actualHumidity: 0.348,
              },
            },
          ],
        },
      ],
    },
  ]
}
