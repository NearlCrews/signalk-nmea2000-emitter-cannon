import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type {
  ConversionCallback,
  ConversionModule,
  JSONSchema,
  N2KMessage,
  SignalKApp,
  SignalKPlugin,
  SubConversionModule,
} from "../types/index.js";
import { createSmoother } from "../utils/smoothing.js";

/**
 * Battery configuration interface
 */
interface BatteryConfig {
  signalkId: string | number;
  instanceId: number;
}

/**
 * Battery conversion options
 */
interface BatteryOptions {
  batteries: BatteryConfig[];
  enabled?: boolean;
  resend?: number;
  resendTime?: number;
}

/**
 * Battery conversion module - converts Signal K battery data to NMEA 2000 PGNs 127506 & 127508
 */
export default function createBatteryConversion(
  _app: SignalKApp,
  _plugin: SignalKPlugin
): ConversionModule {
  // Instance-scoped smoothing state (cleared when plugin restarts)
  const timeRemainingSmoother = createSmoother(0.3);

  const batteryKeys = [
    "voltage",
    "current",
    "temperature",
    "Temperature1",
    "capacity.stateOfCharge",
    "capacity.timeRemaining",
    "capacity.remaining",
    "capacity.actual",
    "capacity.stateOfHealth",
    "ripple",
  ];

  return {
    title: "Battery (127506 & 127508)",
    optionKey: "BATTERY",
    context: "vessels.self",
    properties: (): JSONSchema["properties"] => ({
      batteries: {
        title: "Battery Mapping",
        type: "array",
        items: {
          type: "object",
          properties: {
            signalkId: {
              title: "Signal K battery id",
              type: "string",
            },
            instanceId: {
              title: "NMEA2000 Battery Instance Id",
              type: "number",
            },
          },
        },
      },
    }),

    testOptions: {
      batteries: [
        {
          signalkId: 0,
          instanceId: 1,
        },
      ],
    },

    conversions: (options: unknown): SubConversionModule[] | null => {
      const batteryOptions = options as BatteryOptions;
      if (!batteryOptions?.batteries) {
        return null;
      }

      return batteryOptions.batteries.map(
        (battery): SubConversionModule => ({
          keys: batteryKeys.map((key) => `electrical.batteries.${battery.signalkId}.${key}`),
          timeouts: batteryKeys.map(() => 60000),
          callback: ((
            voltage: number | null,
            current: number | null,
            temperature: number | null,
            temperature1: number | null,
            stateOfCharge: number | null,
            timeRemaining: number | null,
            capacityRemaining: number | null,
            capacityActual: number | null,
            stateOfHealth: number | null,
            ripple: number | null
          ) => {
            const res: N2KMessage[] = [];

            // Prefer 'temperature' if available; otherwise fall back to 'Temperature1' (both are Kelvin)
            const tempOut = temperature !== null ? temperature : temperature1;

            // PGN 127508: Battery Status
            if (voltage !== null || current !== null || tempOut !== null) {
              res.push({
                prio: N2K_DEFAULT_PRIORITY,
                pgn: 127508,
                dst: N2K_BROADCAST_DST,
                fields: {
                  instance: battery.instanceId,
                  voltage: voltage,
                  current: current,
                  temperature: tempOut,
                },
              });
            }

            // Calculate timeRemaining if not provided: remaining [C] / discharge current [A] → seconds
            let computedTR: number | null = null;
            if (timeRemaining === null) {
              // Prefer remainingC; if not available, derive from actual * SoC
              const remainingC =
                capacityRemaining !== null
                  ? capacityRemaining
                  : capacityActual !== null && stateOfCharge !== null
                    ? capacityActual * stateOfCharge
                    : null;

              // Determine discharge current magnitude supporting either convention:
              // - positive current = discharging
              // - negative current = discharging
              let dischargeCurrentA: number | null = null;
              if (current !== null && Number.isFinite(current)) {
                const threshold = 0.5; // Increased from 0.1 to 0.5A to avoid noise
                if (current > threshold) {
                  dischargeCurrentA = current; // positive discharging
                } else if (current < -threshold) {
                  dischargeCurrentA = -current; // negative discharging
                }
              }

              if (remainingC !== null && Number.isFinite(remainingC)) {
                if (
                  dischargeCurrentA !== null &&
                  Number.isFinite(dischargeCurrentA) &&
                  dischargeCurrentA > 0
                ) {
                  // Calculate time remaining from discharge rate
                  let seconds = Math.round(remainingC / dischargeCurrentA); // C / A = s
                  const max = 30 * 24 * 3600; // cap at 30 days
                  if (seconds < 0) seconds = 0;
                  if (seconds > max) seconds = max;

                  // Apply exponential smoothing to reduce jitter
                  const smoothingKey = `${battery.signalkId}_${battery.instanceId}`;
                  seconds = Math.round(timeRemainingSmoother.smooth(smoothingKey, seconds));

                  computedTR = seconds;
                } else {
                  // Current is too low or battery is not discharging: output null (no meaningful value)
                  // This prevents displaying arbitrary maximum when battery is idle/charging
                  computedTR = null;
                }
              }
            }

            // PGN 127506: DC Detailed Status
            if (
              stateOfCharge !== null ||
              timeRemaining !== null ||
              computedTR !== null ||
              stateOfHealth !== null ||
              ripple !== null
            ) {
              const adjustedStateOfCharge = stateOfCharge !== null ? stateOfCharge * 100 : null;
              const adjustedStateOfHealth = stateOfHealth !== null ? stateOfHealth * 100 : null;

              res.push({
                prio: N2K_DEFAULT_PRIORITY,
                pgn: 127506,
                dst: N2K_BROADCAST_DST,
                fields: {
                  instance: battery.instanceId,
                  dcType: "Battery",
                  stateOfCharge: adjustedStateOfCharge,
                  stateOfHealth: adjustedStateOfHealth,
                  timeRemaining: timeRemaining !== null ? timeRemaining : computedTR,
                  rippleVoltage: ripple,
                },
              });
            }

            return res;
          }) as ConversionCallback,

          tests: [
            // Explicit timeRemaining provided; Temperature from 'temperature'
            {
              input: [12.5, 23.1, 290.15, null, 0.93, 12340, 378000, null, 0.6, 12.0],
              expected: [
                {
                  prio: 2,
                  pgn: 127508,
                  dst: 255,
                  fields: {
                    instance: 1,
                    voltage: 12.5,
                    current: 23.1,
                    temperature: 290.15,
                  },
                },
                {
                  prio: 2,
                  pgn: 127506,
                  dst: 255,
                  fields: {
                    instance: 1,
                    dcType: "Battery",
                    stateOfCharge: 93,
                    stateOfHealth: 60,
                    timeRemaining: "03:26:00",
                    rippleVoltage: 12,
                  },
                },
              ],
            },
            // Derived timeRemaining from remaining C and positive discharge current; Temperature from 'Temperature1'
            {
              input: [13.63, 20, null, 293.5, 1.0, null, 378000, null, null, null],
              expected: [
                {
                  prio: 2,
                  pgn: 127508,
                  dst: 255,
                  fields: {
                    instance: 1,
                    voltage: 13.63,
                    current: 20,
                    temperature: 293.5,
                  },
                },
                {
                  prio: 2,
                  pgn: 127506,
                  dst: 255,
                  fields: {
                    instance: 1,
                    dcType: "Battery",
                    stateOfCharge: 100,
                    timeRemaining: "05:15:00",
                  },
                },
              ],
            },
            // Derived timeRemaining with negative-discharge convention (current = -20 A)
            {
              input: [13.63, -20, null, 293.5, 1.0, null, 378000, null, null, null],
              expected: [
                {
                  prio: 2,
                  pgn: 127508,
                  dst: 255,
                  fields: {
                    instance: 1,
                    voltage: 13.63,
                    current: -20,
                    temperature: 293.5,
                  },
                },
                {
                  prio: 2,
                  pgn: 127506,
                  dst: 255,
                  fields: {
                    instance: 1,
                    dcType: "Battery",
                    stateOfCharge: 100,
                    timeRemaining: "05:15:00",
                  },
                },
              ],
            },
            // Low current (below threshold): omit timeRemaining field (no meaningful value)
            {
              input: [13.26, 0, null, 292.9, 0.99, null, 376056, 378000, null, null],
              expected: [
                {
                  prio: 2,
                  pgn: 127508,
                  dst: 255,
                  fields: {
                    instance: 1,
                    voltage: 13.26,
                    current: 0,
                    temperature: 292.9,
                  },
                },
                {
                  prio: 2,
                  pgn: 127506,
                  dst: 255,
                  fields: {
                    instance: 1,
                    dcType: "Battery",
                    stateOfCharge: 99,
                    // timeRemaining omitted when null - canboatjs won't include it in parsed output
                  },
                },
              ],
            },
          ],
        })
      );
    },
  };
}
