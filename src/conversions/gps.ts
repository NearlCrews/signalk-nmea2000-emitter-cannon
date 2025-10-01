import type {
  ConversionModule,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  ConversionCallback,
} from '../types/index.js'

/**
 * GPS position interface for Signal K position data
 */
interface Position {
  latitude: number
  longitude: number
  altitude?: number
}

/**
 * GPS conversion module - converts Signal K position data to NMEA 2000 PGNs 129025 & 129029
 */
export default function createGpsConversion(
  app: SignalKApp,
): ConversionModule<[Position | null]> {
  let lastUpdate: Date | null = null

  return {
    title: 'Location (129025,129029)',
    optionKey: 'GPS_LOCATION',
    keys: ['navigation.position'],
    callback: ((position: Position | null) => {
      try {
        // Validate position input
        if (!position || typeof position !== 'object') {
          return []
        }

        const pos = position as Position
        if (typeof pos.latitude !== 'number' || typeof pos.longitude !== 'number') {
          return []
        }

        // Always generate basic position message (PGN 129025)
        const res: N2KMessage[] = [
          {
            prio: 2,
            pgn: 129025,
            dst: 255,
            fields: {
              latitude: pos.latitude,
              longitude: pos.longitude,
            },
          },
        ]

        // Generate detailed GNSS data (PGN 129029) with rate limiting
        if (lastUpdate === null || Date.now() - lastUpdate.getTime() > 1000) {
          lastUpdate = new Date()

          const dateObj = new Date()
          const date = Math.trunc(dateObj.getTime() / 86400 / 1000)
          const time =
            dateObj.getUTCHours() * (60 * 60) +
            dateObj.getUTCMinutes() * 60 +
            dateObj.getUTCSeconds()

          res.push({
            prio: 2,
            pgn: 129029,
            dst: 255,
            fields: {
              date,
              time,
              latitude: pos.latitude,
              longitude: pos.longitude,
              gnssType: 'GPS+SBAS/WAAS',
              method: 'DGNSS fix',
              integrity: 'No integrity checking',
              numberOfSvs: 16,
              hdop: 0.64,
              geoidalSeparation: -0.01,
              referenceStations: 1,
              list: [
                {
                  referenceStationType: 'GPS+SBAS/WAAS',
                  referenceStationId: 7,
                },
              ],
            },
          })
        }

        return res
      } catch (err) {
        app.error(err as Error)
        return []
      }
    }) as ConversionCallback<[Position | null]>,

    tests: [
      {
        input: [{ longitude: -75.487264, latitude: 32.0631296 }],
        expected: [
          {
            prio: 2,
            pgn: 129025,
            dst: 255,
            fields: {
              latitude: 32.0631296,
              longitude: -75.487264,
            },
          },
          {
            prio: 2,
            pgn: 129029,
            dst: 255,
            fields: {
              latitude: 32.0631296,
              longitude: -75.487264,
              gnssType: 'GPS+SBAS/WAAS',
              method: 'DGNSS fix',
              integrity: 'No integrity checking',
              numberOfSvs: 16,
              hdop: 0.64,
              geoidalSeparation: -0.01,
              referenceStations: 1,
              list: [
                {
                  referenceStationType: 'GPS+SBAS/WAAS',
                  referenceStationId: 7,
                },
              ],
            },
            __preprocess__: (testResult: N2KMessage) => {
              // Remove dynamic date/time fields for testing
              delete testResult.fields.date
              delete testResult.fields.time
            },
          },
        ],
      },
      {
        // Test with altitude data
        input: [{ longitude: -122.419416, latitude: 37.774929, altitude: 10.5 }],
        expected: [
          {
            prio: 2,
            pgn: 129025,
            dst: 255,
            fields: {
              latitude: 37.774929,
              longitude: -122.419416,
            },
          },
        ],
      },
    ],
  }
}
