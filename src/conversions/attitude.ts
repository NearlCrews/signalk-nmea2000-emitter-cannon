import type { ConversionModule, N2KMessage } from '../types/index.js'

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
export default function createAttitudeConversion(): ConversionModule {
  return {
    title: "Attitude (127257)",
    optionKey: "ATTITUDE",
    keys: ["navigation.attitude"],
    callback: (attitude: unknown): N2KMessage[] => {
      try {
        // Validate attitude input
        if (!attitude || typeof attitude !== 'object') {
          return []
        }

        const attitudeData = attitude as AttitudeData

        return [
          {
            prio: 2,
            pgn: 127257,
            dst: 255,
            fields: {
              sid: 87,
              pitch: attitudeData.pitch,
              yaw: attitudeData.yaw,
              roll: attitudeData.roll,
            },
          },
        ]
      } catch (err) {
        console.error('Error in attitude conversion:', err)
        return []
      }
    },

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
