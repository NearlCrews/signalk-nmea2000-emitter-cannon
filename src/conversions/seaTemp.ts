import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Sea/Air Temperature conversion module - converts Signal K environmental data to NMEA 2000 PGN 130310
 */
export default function createSeaTempConversion(): ConversionModule {
  return {
    title: "Sea/Air Temp (130310)",
    optionKey: "SEA_TEMPERATURE",
    keys: [
      "environment.water.temperature",
      "environment.outside.temperature",
      "environment.outside.pressure",
    ],
    callback: (water: unknown, air: unknown, pressure: unknown): N2KMessage[] => {
      try {
        // Validate inputs
        const waterTemperature = typeof water === 'number' ? water : null
        const outsideTemperature = typeof air === 'number' ? air : null
        const atmosphericPressure = typeof pressure === 'number' ? pressure : null

        return [
          {
            prio: 2,
            pgn: 130310,
            dst: 255,
            fields: {
              sid: 0xff,
              waterTemperature,
              outsideAmbientAirTemperature: outsideTemperature,
              atmosphericPressure,
            },
          },
        ]
      } catch (err) {
        console.error('Error in sea/air temperature conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [281.2, 291, 20100],
        expected: [
          {
            prio: 2,
            pgn: 130310,
            dst: 255,
            fields: {
              waterTemperature: 281.2,
              outsideAmbientAirTemperature: 291,
              atmosphericPressure: 20100,
            },
          },
        ],
      },
    ],
  }
}
