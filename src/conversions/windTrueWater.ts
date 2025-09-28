import type { ConversionModule, N2KMessage } from '../types/index.js';

export default function createWindTrueWaterConversion(): ConversionModule {
  return {
    title: "Wind True over water (130306)",
    optionKey: "WIND_TRUE",
    keys: ["environment.wind.angleTrueWater", "environment.wind.speedTrue"],
    callback: (angle: unknown, speed: unknown): N2KMessage[] => {
      if (typeof angle !== 'number' || typeof speed !== 'number') {
        return [];
      }

      try {
        return [
          {
            prio: 2,
            pgn: 130306,
            dst: 255,
            fields: {
              windSpeed: speed,
              windAngle: angle < 0 ? angle + Math.PI * 2 : angle,
              reference: "True (boat referenced)",
            },
          },
        ];
      } catch (err) {
        console.error(err);
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
              reference: "True (boat referenced)",
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
              reference: "True (boat referenced)",
            },
          },
        ],
      },
    ],
  };
}
