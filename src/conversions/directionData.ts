import type { ConversionModule, N2KMessage } from '../types/index.js'

/**
 * Direction Data conversion module - converts Signal K navigation directions to NMEA 2000 PGN 130577
 */
export default function createDirectionDataConversion(): ConversionModule {
  return {
    title: "Direction Data (130577)",
    optionKey: "DIRECTION_DATA",
    keys: [
      "navigation.courseOverGroundTrue",
      "navigation.courseOverGroundMagnetic",
      "navigation.headingTrue",
      "navigation.headingMagnetic",
      "navigation.courseRhumbline.nextPoint.bearingTrue",
      "navigation.courseRhumbline.nextPoint.bearingMagnetic",
      "navigation.courseGreatCircle.nextPoint.bearingTrue",
      "navigation.courseGreatCircle.nextPoint.bearingMagnetic",
    ],
    callback: (
      cogTrue: unknown,
      cogMagnetic: unknown,
      headingTrue: unknown,
      headingMagnetic: unknown,
      _rhumbBearingTrue: unknown,
      _rhumbBearingMagnetic: unknown,
      _gcBearingTrue: unknown,
      _gcBearingMagnetic: unknown
    ): N2KMessage[] => {
      try {
        // Convert and validate inputs
        const cogTrueValue = typeof cogTrue === 'number' ? cogTrue : null
        const cogMagneticValue = typeof cogMagnetic === 'number' ? cogMagnetic : null
        const headingTrueValue = typeof headingTrue === 'number' ? headingTrue : null
        const headingMagneticValue = typeof headingMagnetic === 'number' ? headingMagnetic : null

        // Send direction data if we have at least one direction value
        if (
          cogTrueValue === null &&
          cogMagneticValue === null &&
          headingTrueValue === null &&
          headingMagneticValue === null
        ) {
          return []
        }

        return [
          {
            prio: 2,
            pgn: 130577,
            dst: 255,
            fields: {
              dataMode: "Autonomous", // Could be made configurable
              cogReference:
                cogTrueValue !== null ? "True" : cogMagneticValue !== null ? "Magnetic" : "Unavailable",
              sidForCog: 0,
              cog: cogTrueValue || cogMagneticValue,
              sogReference: "Unavailable", // Would need SOG data source info
              sidForSog: 0,
              sog: null, // This PGN focuses on direction, not speed
              headingReference:
                headingTrueValue !== null ? "True" : headingMagneticValue !== null ? "Magnetic" : "Unavailable",
              sidForHeading: 0,
              heading: headingTrueValue || headingMagneticValue,
              speedThroughWaterReference: "Unavailable",
              sidForStw: 0,
              speedThroughWater: null,
              set: null, // Current set - not typically available
              drift: null, // Current drift - not typically available
            },
          },
        ]
      } catch (err) {
        console.error('Error in direction data conversion:', err)
        return []
      }
    },

    tests: [
      {
        input: [1.571, null, 1.396, null, 0.785, null, null, null], // 90° COG true, 80° heading true, 45° rhumb bearing
        expected: [
          {
            prio: 2,
            pgn: 130577,
            dst: 255,
            fields: {
              cog: 1.571,
              cogReference: "True",
              dataMode: "Autonomous",
              heading: 1.396,
            },
          },
        ],
      },
      {
        input: [null, 1.047, null, 0.698, null, null, null, null], // 60° COG magnetic, 40° heading magnetic
        expected: [
          {
            prio: 2,
            pgn: 130577,
            dst: 255,
            fields: {
              cog: 1.047,
              cogReference: "Magnetic",
              dataMode: "Autonomous",
              heading: 0.698,
            },
          },
        ],
      },
    ],
  }
}
