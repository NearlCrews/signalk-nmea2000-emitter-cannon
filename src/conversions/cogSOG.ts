import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * COG & SOG conversion module - converts Signal K course and speed data to NMEA 2000 PGN 129026
 */
export default function createCogSogConversion(): ConversionModule {
  return {
    title: "COG & SOG (129026)",
    optionKey: "COG_SOG",
    keys: ["navigation.courseOverGroundTrue", "navigation.speedOverGround"],
    callback: (course: unknown, speed: unknown): N2KMessage[] => {
      try {
        // Validate inputs - allow null values for individual fields
        const cog = typeof course === 'number' ? course : null
        const sog = typeof speed === 'number' ? speed : null
        
        // Return empty array if both values are null
        if (cog === null && sog === null) {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              cogReference: "True",
              cog,
              sog,
            },
          },
        ]
      } catch (err) {
        console.error('Error in COG/SOG conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [2.1, 9],
        expected: [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              cogReference: "True",
              cog: 2.1,
              sog: 9,
            },
          },
        ],
      },
      {
        // Test with null course
        input: [null, 5.5],
        expected: [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              cogReference: "True",
              sog: 5.5,
            },
          },
        ],
      },
      {
        // Test with null speed
        input: [1.57, null],
        expected: [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              cogReference: "True",
              cog: 1.57,
            },
          },
        ],
      },
    ],
  }
}
