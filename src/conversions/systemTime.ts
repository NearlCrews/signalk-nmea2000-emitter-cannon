import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * System Time conversion module - converts current time to NMEA 2000 PGN 126992
 */
export default function createSystemTimeConversion(): ConversionModule {
  return {
    title: "System Time (126992)",
    sourceType: "timer",
    interval: 1000,
    optionKey: "SYSTEM_TIME",
    callback: (...values: unknown[]): N2KMessage[] => {
      try {
        const inputDate = values[1] as Date | undefined
        const dateObj = inputDate || new Date()
        const date = Math.trunc(dateObj.getTime() / 86400 / 1000)
        const time = dateObj.getUTCHours() * (60 * 60) + dateObj.getUTCMinutes() * 60 + dateObj.getUTCSeconds()

        return [
          {
            prio: 2,
            pgn: 126992,
            dst: 255,
            fields: {
              date,
              time,
            },
          },
        ]
      } catch (err) {
        console.error('Error in system time conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [undefined, new Date("2017-04-15T14:59:53.123Z")],
        expected: [
          {
            prio: 2,
            pgn: 126992,
            dst: 255,
            fields: {
              date: "2017.04.15",
              time: "14:59:53",
            },
          },
        ],
      },
    ],
  }
}
