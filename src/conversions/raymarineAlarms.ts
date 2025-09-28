import type { ConversionModule, N2KMessage } from '../types/index.js';

interface AlarmValue {
  state: string;
  method?: string[];
}

interface RaymarineAlarmDelta {
  context: string;
  updates: Array<{
    values: Array<{
      path: string;
      value: AlarmValue;
    }>;
  }>;
}

interface AlarmPGN extends N2KMessage {
  path: string;
}

let pgns: AlarmPGN[] = [];

export default function createRaymarineAlarmsConversion(): ConversionModule {
  return {
    title: "Raymarine (Seatalk) Alarms (65288)",
    optionKey: "RAYMARINE_ALARMS",
    keys: ["notifications.navigation.anchor", "notifications.mob"],
    context: "vessels.self",
    sourceType: "subscription",
    callback: (delta: unknown): N2KMessage[] => {
      if (!delta || typeof delta !== 'object') {
        return [];
      }

      const deltaMsg = delta as RaymarineAlarmDelta;
      if (!deltaMsg.updates || !Array.isArray(deltaMsg.updates) || deltaMsg.updates.length === 0) {
        return [];
      }

      const firstUpdate = deltaMsg.updates[0];
      if (!firstUpdate?.values || !Array.isArray(firstUpdate.values) || firstUpdate.values.length === 0) {
        return [];
      }

      const update = firstUpdate.values[0];
      if (!update) {
        return [];
      }

      const path = update.path;
      const value = update.value;

      // Don't create a loop by sending out notifications we received from NMEA
      if (path.includes("notifications.nmea")) {
        return pgns;
      }

      // Remove the pgns and reprocess them for changes
      pgns = pgns.filter((obj) => obj.path !== path);

      let state: string | undefined;
      const method = value.method || [];
      
      if (value.state === "normal") {
        if (method.indexOf("sound") !== -1) {
          state = "Alarm condition not met";
        }
      } else {
        if (method.indexOf("sound") === -1) {
          state = "Alarm condition met and silenced";
        } else {
          state = "Alarm condition met and not silenced";
        }
      }

      let alarmId: string | undefined;
      if (path.startsWith("notifications.navigation.anchor")) {
        // There should be a better one but not supported by canboatjs yet
        alarmId = "Deep Anchor";
      } else if (path.startsWith("notifications.mob")) {
        alarmId = "MOB";
      }

      if (state && alarmId) {
        pgns.push({
          prio: 2,
          pgn: 65288,
          dst: 255,
          path: path,
          fields: {
            sid: 1,
            alarmStatus: state,
            alarmId: alarmId,
            alarmGroup: "Instrument",
            alarmPriority: 1,
            manufacturerCode: "Raymarine",
            industryCode: "Marine Industry",
          },
        });
      }

      try {
        return pgns;
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    tests: [
      {
        input: [
          {
            context: "vessels.urn:mrn:imo:mmsi:367301250",
            updates: [
              {
                values: [
                  {
                    path: "notifications.navigation.anchor",
                    value: {
                      state: "alert",
                      method: ["sound"],
                    },
                  },
                ],
              },
            ],
          },
        ],
        expected: [
          {
            prio: 2,
            pgn: 65288,
            dst: 255,
            fields: {
              manufacturerCode: "Raymarine",
              industryCode: "Marine Industry",
              sid: 1,
              alarmStatus: "Alarm condition met and not silenced",
              alarmId: "Deep Anchor",
              alarmGroup: "Instrument",
              alarmPriority: 1,
            },
          },
        ],
      },
    ],
  };
}
