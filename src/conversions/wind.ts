import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Wind conversion module - converts Signal K wind data to NMEA 2000 PGN 130306
 */
export default function createWindConversion(): ConversionModule {
  return {
    title: "Wind (130306)",
    optionKey: "WIND",
    keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
    callback: (angle: unknown, speed: unknown): N2KMessage[] => {
      try {
        // Validate inputs
        const windAngle = typeof angle === 'number' ? angle : null
        const windSpeed = typeof speed === 'number' ? speed : null
        
        if (windAngle === null && windSpeed === null) {
          return []
        }

        // Convert negative angles to positive (0-2π range)
        const normalizedAngle = windAngle !== null && windAngle < 0 
          ? windAngle + Math.PI * 2 
          : windAngle

        return [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed,
              windAngle: normalizedAngle,
              reference: "Apparent",
            },
          },
        ]
      } catch (err) {
        console.error('Error in wind conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [2.0944, 1.2],
        expected: [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed: 1.2,
              windAngle: 2.0944,
              reference: "Apparent",
            },
          },
        ],
      },
      {
        input: [-2.0944, 1.5],
        expected: [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed: 1.5,
              windAngle: 4.1888,
              reference: "Apparent",
            },
          },
        ],
      },
      {
        // Test with null values
        input: [null, 0],
        expected: [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed: 0,
              windAngle: null,
              reference: "Apparent",
            },
          },
        ],
      },
    ],
  }
}
