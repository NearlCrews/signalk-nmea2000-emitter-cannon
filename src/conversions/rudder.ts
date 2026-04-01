import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";

/**
 * Rudder position conversion module - converts Signal K rudder data to NMEA 2000 PGN 127245
 */
export default function createRudderConversion(app: SignalKApp): ConversionModule {
  return {
    title: "Rudder Position (127245)",
    optionKey: "RUDDER",
    keys: ["steering.rudderAngle.main", "steering.rudderAngleTarget.main"],
    timeouts: [1000, 1000], // 1 second for responsive steering
    callback: (rudderAngle: unknown, rudderAngleTarget: unknown): N2KMessage[] => {
      try {
        // Validate inputs
        const angle = typeof rudderAngle === "number" ? rudderAngle : null;
        const target = typeof rudderAngleTarget === "number" ? rudderAngleTarget : null;

        // Return empty array if no rudder data available
        if (angle === null && target === null) {
          return [];
        }

        // Determine direction order based on target angle
        let directionOrder: string = "No Order";
        if (target !== null) {
          if (target > 0) {
            directionOrder = "Turn Right";
          } else if (target < 0) {
            directionOrder = "Turn Left";
          }
        }

        return [
          {
            prio: N2K_DEFAULT_PRIORITY,
            pgn: 127245,
            dst: N2K_BROADCAST_DST,
            fields: {
              instance: 0,
              directionOrder,
              angleOrder: Math.abs(target || 0),
              position: angle,
            },
          },
        ];
      } catch (err) {
        app.error(err instanceof Error ? err.message : String(err));
        return [];
      }
    },

    tests: [
      {
        input: [0.0873, 0.1396], // 5 degrees actual, 8 degrees target (starboard)
        expected: [
          {
            prio: 2,
            pgn: 127245,
            dst: 255,
            fields: {
              angleOrder: 0.1396,
              directionOrder: "No Order",
              instance: 0,
              position: 0.0873,
            },
          },
        ],
      },
      {
        input: [-0.0349, -0.0698], // 2 degrees port actual, 4 degrees port target
        expected: [
          {
            prio: 2,
            pgn: 127245,
            dst: 255,
            fields: {
              angleOrder: 0.0698,
              directionOrder: "No Order",
              instance: 0,
              position: -0.0349,
            },
          },
        ],
      },
      {
        // Test with only actual position, no target
        input: [0.0524, null],
        expected: [
          {
            prio: 2,
            pgn: 127245,
            dst: 255,
            fields: {
              angleOrder: 0,
              directionOrder: "No Order",
              instance: 0,
              position: 0.0524,
            },
          },
        ],
      },
      {
        // Test with zero target (centered)
        input: [0.0175, 0],
        expected: [
          {
            prio: 2,
            pgn: 127245,
            dst: 255,
            fields: {
              angleOrder: 0,
              directionOrder: "No Order",
              instance: 0,
              position: 0.0175,
            },
          },
        ],
      },
    ],
  };
}
