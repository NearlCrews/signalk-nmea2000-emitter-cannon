import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KFieldValue, N2KMessage } from "../types/index.js";

export default function createSmallCraftStatusConversion(): ConversionModule {
  return {
    title: "Small Craft Status (130576)",
    optionKey: "SMALL_CRAFT_STATUS",
    keys: [
      "steering.trimTab.port",
      "steering.trimTab.starboard",
      "propulsion.main.trimAngle",
      "design.displacement",
      "performance.velocityMadeGood",
      "performance.polarSpeed",
      "performance.polarSpeedRatio",
    ],
    timeouts: [5000, 5000, 5000, 60000, 5000, 5000, 5000], // 5s for dynamic, 1min for static
    callback: (
      trimTabPort: unknown,
      trimTabStbd: unknown,
      trimAngle: unknown,
      displacement: unknown,
      vmg: unknown,
      polarSpeed: unknown,
      polarRatio: unknown
    ): N2KMessage[] => {
      // Send small craft status if we have any relevant data
      if (
        trimTabPort == null &&
        trimTabStbd == null &&
        trimAngle == null &&
        vmg == null &&
        polarSpeed == null
      ) {
        return [];
      }

      // Convert trim tab positions to percentage if they're in radians
      const normalizeTabPosition = (position: unknown): number | null => {
        if (position == null || typeof position !== "number") return null;

        // If position seems to be in radians (typically small values), convert to percentage
        if (Math.abs(position) < Math.PI) {
          // Assume full deflection is about ±30 degrees (0.52 radians)
          return Math.round((position / 0.52) * 100);
        }
        // Otherwise assume it's already in percentage
        return Math.round(position);
      };

      const portTabPercent = normalizeTabPosition(trimTabPort);
      const stbdTabPercent = normalizeTabPosition(trimTabStbd);

      const fields: Record<string, N2KFieldValue> = {
        colorCode: "Red", // Default color code
      };

      // Add fields conditionally based on availability
      if (portTabPercent !== null) {
        fields.portTrimTab = portTabPercent;
      }
      if (stbdTabPercent !== null) {
        fields.starboardTrimTab = stbdTabPercent;
      }
      if (typeof trimAngle === "number") {
        fields.trim = trimAngle;
      }
      if (typeof displacement === "number") {
        fields.displacement = displacement;
      }
      if (typeof vmg === "number") {
        fields.velocityMadeGoodToWaypoint = vmg;
      }
      if (typeof polarSpeed === "number") {
        fields.polarSpeed = polarSpeed;
      }
      if (typeof polarRatio === "number") {
        fields.polarSpeedRatio = polarRatio;
      }

      return [
        {
          prio: N2K_DEFAULT_PRIORITY,
          pgn: 130576,
          dst: N2K_BROADCAST_DST,
          fields,
        },
      ];
    },
    tests: [
      {
        input: [0.1, -0.05, 0.0349, 5000, 4.2, 5.1, 0.82], // Small angles in radians
        expected: [
          {
            prio: 2,
            pgn: 130576,
            dst: 255,
            fields: {
              portTrimTab: 19, // ~19% (0.1/0.52 * 100)
              starboardTrimTab: -10, // ~-10%
            },
          },
        ],
      },
      {
        input: [15, -8, null, null, 3.8, null, null], // Already in percentage
        expected: [
          {
            prio: 2,
            pgn: 130576,
            dst: 255,
            fields: {
              portTrimTab: 15,
              starboardTrimTab: -8,
            },
          },
        ],
      },
      {
        input: [null, null, null, null, 2.5, 4.0, 0.625], // Just performance data
        expected: [
          {
            prio: 2,
            pgn: 130576,
            dst: 255,
            fields: {},
          },
        ],
      },
    ],
  };
}
