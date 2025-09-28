import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Magnetic Variance conversion module - converts Signal K magnetic variation to NMEA 2000 PGN 127258
 */
export default function createMagneticVarianceConversion(): ConversionModule {
  return {
    title: "Magnetic Variance (127258)",
    optionKey: "MAGNETIC_VARIANCE",
    keys: ["navigation.magneticVariation", "navigation.magneticVariationAgeOfService"],
    callback: (magneticVariation: unknown, ageOfService: unknown): N2KMessage[] => {
      try {
        // Validate magnetic variation input - required field
        if (typeof magneticVariation !== 'number') {
          return []
        }

        // Validate age of service - optional field with default
        const ageValue = typeof ageOfService === 'number' ? ageOfService : 0

        return [
          {
            prio: 2,
            pgn: 127258,
            dst: 255,
            fields: {
              sid: 0,
              variationSource: "Table",
              ageOfService: ageValue,
              variation: magneticVariation,
            },
          },
        ]
      } catch (err) {
        console.error('Error in magnetic variance conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [0.0349, 30], // 2 degrees east, 30 days old
        expected: [
          {
            prio: 2,
            pgn: 127258,
            dst: 255,
            fields: {
              ageOfService: "1970.01.31",
              sid: 0,
              variation: 0.0349,
            },
          },
        ],
      },
      {
        input: [-0.0524, null], // 3 degrees west, unknown age
        expected: [
          {
            prio: 2,
            pgn: 127258,
            dst: 255,
            fields: {
              ageOfService: "1970.01.01",
              sid: 0,
              variation: -0.0524,
            },
          },
        ],
      },
    ],
  }
}
