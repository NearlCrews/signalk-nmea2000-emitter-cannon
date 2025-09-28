import type { ConversionModule, N2KMessage, SignalKApp } from '../types/index.js';

interface AlertValue {
  state: string;
  message: string;
  alertId?: number;
  method?: string[];
}

interface NotificationDelta {
  context: string;
  updates: Array<{
    values: Array<{
      path: string;
      value: AlertValue;
    }>;
  }>;
}

const alertTypes: Record<string, string> = {
  emergency: "Emergency Alarm",
  alarm: "Alarm",
  warn: "Warning", 
  alert: "Caution",
};

const alertCategory = "Technical";
const alertSystem = 5;

let idCounter = 0;
const ids: Record<string, { alertId: number }> = {};
let pgns: N2KMessage[] = [];

export default function createNotificationsConversion(app: SignalKApp, plugin: { id: string }): ConversionModule {
  return {
    title: "Notifications (126983, 126985)",
    optionKey: "NOTIFICATIONS",
    keys: ["notifications.*"],
    context: "vessels.self",
    sourceType: "subscription",
    callback: (delta: unknown): N2KMessage[] => {
      if (!delta || typeof delta !== 'object') {
        return [];
      }

      const deltaMsg = delta as NotificationDelta;
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

      const value = update.value;
      const type = alertTypes[value.state];

      // Don't create a loop by sending out notifications we received from NMEA
      if (update.path.includes("notifications.nmea")) {
        return pgns;
      }

      let alertId: number;
      
      if (typeof value.alertId === 'number') {
        alertId = value.alertId;
        app.debug(`Using existing alertId ${alertId} for ${update.path}`);

        // Remove the pgns and reprocess them for changes
        pgns = pgns.filter((obj) => obj.fields.alertId !== alertId);

        if (value.state !== "normal") {
          const method = value.method || [];
          let state: string;
          
          if (value.state === "normal") {
            state = "Normal";
          } else if (method.length === 0) {
            state = "Acknowledged";
          } else if (method.indexOf("sound") === -1) {
            state = "Silenced";
          } else {
            state = "Active";
          }

          const idName = alertId.toString().padStart(16, "0");
          
          pgns.push({
            prio: 2,
            pgn: 126985,
            dst: 255,
            fields: {
              alertId: alertId,
              alertType: type,
              alertCategory: alertCategory,
              alertSystem: alertSystem,
              alertSubSystem: 0,
              dataSourceNetworkIdName: Number.parseInt(idName, 10),
              dataSourceInstance: 0,
              dataSourceIndexSource: 0,
              alertOccurrenceNumber: 0,
              languageId: "English (US)",
              alertTextDescription: value.message,
            },
          });
          
          pgns.push({
            prio: 2,
            pgn: 126983,
            dst: 255,
            fields: {
              alertId: alertId,
              alertType: type,
              alertCategory: alertCategory,
              alertSystem: alertSystem,
              alertSubSystem: 0,
              dataSourceNetworkIdName: Number.parseInt(idName, 10),
              dataSourceInstance: 0,
              dataSourceIndexSource: 0,
              alertOccurrenceNumber: 0,
              temporarySilenceStatus: (value.method && value.method.indexOf("sound") === -1) ? "Yes" : "No",
              acknowledgeStatus: (!value.method || value.method.length === 0) ? "Yes" : "No",
              escalationStatus: "No",
              temporarySilenceSupport: "Yes",
              acknowledgeSupport: "Yes",
              escalationSupport: "No",
              triggerCondition: "Auto",
              thresholdStatus: "Threshold Exceeded",
              alertPriority: 0,
              alertState: state,
            },
          });
        }
      } else {
        // Add NMEA2000 alert info so that the alarm can be silenced from a NMEA source
        const existingRecord = ids[update.path];
        if (existingRecord?.alertId) {
          alertId = existingRecord.alertId;
          app.debug(`Assigning existing alertId ${alertId} to ${update.path}`);
        } else {
          alertId = ++idCounter;
          ids[update.path] = { alertId: alertId };
          app.debug(`Assigning new alertId ${alertId} to ${update.path}`);
        }

        // Send delta with alert details (if handleMessage is available)
        if (app.handleMessage) {
          const modifiedDelta = {
            ...deltaMsg,
            updates: [{
              ...firstUpdate,
              values: [{
                ...update,
                value: {
                  ...value,
                  alertType: type,
                  alertCategory: alertCategory,
                  alertSystem: alertSystem,
                  alertId: alertId,
                }
              }]
            }]
          };
          
          app.debug(`New delta with alertId: ${JSON.stringify(modifiedDelta)}`);
          // Cast to compatible type for Signal K delta handling
          app.handleMessage(plugin.id, modifiedDelta as Parameters<NonNullable<typeof app.handleMessage>>[1]);
        }
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
                    path: "notifications.environment.inside.refrigerator.temperature",
                    value: {
                      state: "alert",
                      message: "The Fridge Temperature is high",
                      alertId: 1,
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
            pgn: 126985,
            dst: 255,
            fields: {
              alertType: "Caution",
              alertCategory: "Technical",
              alertSystem: 5,
              alertSubSystem: 0,
              alertId: 1,
              dataSourceNetworkIdName: 1,
              dataSourceInstance: 0,
              dataSourceIndexSource: 0,
              alertOccurrenceNumber: 0,
              languageId: "English (US)",
              alertTextDescription: "The Fridge Temperature is high",
            },
          },
          {
            prio: 2,
            pgn: 126983,
            dst: 255,
            fields: {
              alertType: "Caution",
              alertCategory: "Technical",
              alertSystem: 5,
              alertSubSystem: 0,
              alertId: 1,
              dataSourceNetworkIdName: 1,
              dataSourceInstance: 0,
              dataSourceIndexSource: 0,
              alertOccurrenceNumber: 0,
              temporarySilenceStatus: "No",
              acknowledgeStatus: "Yes",
              escalationStatus: "No",
              temporarySilenceSupport: "Yes",
              acknowledgeSupport: "Yes",
              escalationSupport: "No",
              triggerCondition: "Auto",
              thresholdStatus: "Threshold Exceeded",
              alertPriority: 0,
              alertState: "Acknowledged",
            },
          },
        ],
      },
    ],
  };
}
