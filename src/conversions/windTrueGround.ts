import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage, SignalKApp } from "../types/index.js";

export default function createWindTrueGroundConversion(app: SignalKApp): ConversionModule {
  return {
    title: "Wind True over ground (130306)",
    optionKey: "WIND_TRUE_GROUND",
    keys: ["environment.wind.directionTrue", "environment.wind.speedOverGround"],
    callback: (angle: unknown, speed: unknown): N2KMessage[] => {
      if (typeof angle !== "number" || typeof speed !== "number") {
        return [];
      }

      try {
        return [
          {
            prio: N2K_DEFAULT_PRIORITY,
            pgn: 130306,
            dst: N2K_BROADCAST_DST,
            fields: {
              windSpeed: speed,
              windAngle: angle < 0 ? angle + Math.PI * 2 : angle,
              reference: "True (ground referenced to North)",
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
        input: [2.0944, 1.2],
        expected: [
          {
            pgn: 130306,
            dst: 255,
            prio: 2,
            fields: {
              windSpeed: 1.2,
              windAngle: 2.0944,
              reference: "True (ground referenced to North)",
            },
          },
        ],
      },
      {
        input: [-2.0944, 1.5],
        expected: [
          {
            pgn: 130306,
            dst: 255,
            prio: 2,
            fields: {
              windSpeed: 1.5,
              windAngle: 4.1888,
              reference: "True (ground referenced to North)",
            },
          },
        ],
      },
    ],
  };
}
