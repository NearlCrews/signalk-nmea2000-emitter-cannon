import type { ConversionModule, N2KMessage, N2KFieldValue } from '../types/index.js';

export default function createTimeToMarkConversion(): ConversionModule {
  return {
    title: "Time to/from Mark (129301)",
    optionKey: "TIME_TO_MARK",
    keys: [
      "navigation.course.nextPoint.timeToGo",
      "navigation.course.previousPoint.timeSince",
      "navigation.course.nextPoint.type",
    ],
    timeouts: [5000, 5000, 5000], // 5 seconds
    callback: (timeToGo: unknown, timeSince: unknown, markType: unknown): N2KMessage[] => {
      if (timeToGo == null && timeSince == null) {
        return [];
      }

      const fields: Record<string, N2KFieldValue> = {
        sid: 0,
        markType: markType === "waypoint" ? "Waypoint" : "Mark",
      };

      // Add conditional fields based on availability
      if (typeof timeToGo === 'number') {
        fields.timeToMark = timeToGo;
      }
      if (typeof timeSince === 'number') {
        fields.timeSinceMark = timeSince;
      }

      return [
        {
          prio: 2,
          pgn: 129301,
          dst: 255,
          fields,
        },
      ];
    },
    tests: [
      {
        input: [1800, null, "waypoint"], // 30 minutes to waypoint
        expected: [
          {
            prio: 2,
            pgn: 129301,
            dst: 255,
            fields: {
              sid: 0,
              timeToMark: 1800,
              markType: "Waypoint",
            },
          },
        ],
      },
      {
        input: [null, 900, "mark"], // 15 minutes since mark
        expected: [
          {
            prio: 2,
            pgn: 129301,
            dst: 255,
            fields: {
              sid: 0,
              timeSinceMark: 900,
              markType: "Mark",
            },
          },
        ],
      },
    ],
  };
}
