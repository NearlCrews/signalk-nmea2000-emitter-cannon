import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Create a pressure message for NMEA 2000
 */
function createPressureMessage(pressure: number, source: string): N2KMessage[] {
  return [
    {
      prio: 2,
      pgn: 130314,
      dst: 255,
      fields: {
        instance: 100,
        source,
        pressure,
      },
    },
  ]
}

/**
 * Pressure conversion modules - converts Signal K pressure data to NMEA 2000 PGN 130314
 */
export default function createPressureConversions(): ConversionModule[] {
  return [
    {
      title: "Atmospheric Pressure (130314)",
      optionKey: "PRESSURE_ATMOSPHERIC",
      keys: ["environment.outside.pressure"],
      callback: (pressure: unknown): N2KMessage[] => {
        try {
          if (typeof pressure !== 'number') {
            return []
          }

          return createPressureMessage(pressure, "Atmospheric")
        } catch (err) {
          console.error('Error in atmospheric pressure conversion:', err)
          return []
        }
      },

      tests: [
        {
          input: [103047.8],
          expected: [
            {
              prio: 2,
              pgn: 130314,
              dst: 255,
              fields: {
                instance: 100,
                source: "Atmospheric",
                pressure: 103047.8,
              },
            },
          ],
        },
        {
          // Test with standard sea level pressure
          input: [101325],
          expected: [
            {
              prio: 2,
              pgn: 130314,
              dst: 255,
              fields: {
                instance: 100,
                source: "Atmospheric",
                pressure: 101325,
              },
            },
          ],
        },
        {
          // Test with low pressure
          input: [98000],
          expected: [
            {
              prio: 2,
              pgn: 130314,
              dst: 255,
              fields: {
                instance: 100,
                source: "Atmospheric",
                pressure: 98000,
              },
            },
          ],
        },
      ],
    },
  ]
}
