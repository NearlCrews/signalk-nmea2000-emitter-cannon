import type {
  ConversionModule,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  ConversionCallback,
} from '../types/index.js'

/**
 * Attitude data interface
 */
interface AttitudeData {
  pitch?: number
  yaw?: number
  roll?: number
}

/**
 * Attitude conversion module - converts Signal K attitude data to NMEA 2000 PGN 127257
 */
export default function createAttitudeConversion(
  app: SignalKApp,
): ConversionModule<[AttitudeData]> {
  return {
    title: 'Attitude (127257)',
    optionKey: 'ATTITUDE',
    keys: ['navigation.attitude'],
    callback: ((attitude: AttitudeData) => {
      try {
        // Validate attitude input
        if (!attitude || typeof attitude !== 'object') {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 127257,
            dst: 255,
            fields: {
              sid: 87,
              pitch: attitude.pitch,
              yaw: attitude.yaw,
              roll: attitude.roll,
            },
          },
        ]
      } catch (err) {
        app.error(err as Error)
        return []
      }
    }) as ConversionCallback<[AttitudeData]>,

    tests: [
      {
        input: [
          {
            yaw: 1.8843,
            pitch: 0.042,
            roll: 0.042,
          },
        ],
        expected: [
          {
            dst: 255,
            fields: {
              pitch: 0.042,
              roll: 0.042,
              sid: 87,
              yaw: 1.8843,
            },
            pgn: 127257,
            prio: 2,
          },
        ],
      },
    ],
  }
}
