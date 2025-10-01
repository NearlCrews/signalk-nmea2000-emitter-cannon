import { isUndefined } from 'es-toolkit'
import type {
  ConversionModule,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  ConversionCallback,
} from '../types/index.js'

/**
 * Depth conversion module - converts Signal K depth data to NMEA 2000 PGN 128267
 */
export default function createDepthConversion(
  app: SignalKApp,
): ConversionModule<[number | null]> {
  return {
    title: 'Depth (128267)',
    optionKey: 'DEPTH',
    keys: ['environment.depth.belowTransducer'],
    callback: ((belowTransducer: number | null) => {
      try {
        // Validate depth input
        if (typeof belowTransducer !== 'number') {
          return []
        }

        // Get additional depth data from Signal K app
        const surfaceToTransducer = app.getSelfPath(
          'environment.depth.surfaceToTransducer.value',
        ) as number | undefined
        const transducerToKeel = app.getSelfPath(
          'environment.depth.transducerToKeel.value',
        ) as number | undefined

        // Calculate offset - prefer surfaceToTransducer, fallback to transducerToKeel, default to 0
        const offset = !isUndefined(surfaceToTransducer)
          ? surfaceToTransducer
          : !isUndefined(transducerToKeel)
          ? transducerToKeel
          : 0

        return [
          {
            prio: 2,
            pgn: 128267,
            dst: 255,
            fields: {
              depth: belowTransducer,
              offset,
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
        input: [4.5],
        skSelfData: {
          'environment.depth.surfaceToTransducer.value': 1,
        },
        expected: [
          {
            prio: 2,
            pgn: 128267,
            dst: 255,
            fields: {
              depth: 4.5,
              offset: 1,
            },
          },
        ],
      },
      {
        input: [2.1],
        skSelfData: {
          'environment.depth.transducerToKeel.value': 3,
        },
        expected: [
          {
            prio: 2,
            pgn: 128267,
            dst: 255,
            fields: {
              depth: 2.1,
              offset: 3,
            },
          },
        ],
      },
      {
        // Test with no offset data available
        input: [5.0],
        skSelfData: {},
        expected: [
          {
            prio: 2,
            pgn: 128267,
            dst: 255,
            fields: {
              depth: 5.0,
              offset: 0,
            },
          },
        ],
      },
    ],
  }
}
