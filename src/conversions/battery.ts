import type { ConversionModule, N2KMessage, JSONSchema } from '../types/index.js'

/**
 * Battery configuration interface
 */
interface BatteryConfig {
  signalkId: string | number
  instanceId: number
}

/**
 * Battery conversion options
 */
interface BatteryOptions {
  BATTERY: {
    batteries: BatteryConfig[]
  }
}

/**
 * Battery conversion module - converts Signal K battery data to NMEA 2000 PGNs 127506 & 127508
 */
export default function createBatteryConversion(): ConversionModule {
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
  ]

  return {
    title: "Battery (127506 & 127508)",
    optionKey: "BATTERY",
    context: "vessels.self",
    properties: (): JSONSchema['properties'] => ({
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
      BATTERY: {
        batteries: [
          {
            signalkId: 0,
            instanceId: 1,
          },
        ],
      },
    },

    conversions: (options: unknown) => {
      const batteryOptions = options as BatteryOptions
      if (!batteryOptions?.BATTERY?.batteries) {
        return null
      }

      return batteryOptions.BATTERY.batteries.map((battery) => ({
        keys: batteryKeys.map((key) => `electrical.batteries.${battery.signalkId}.${key}`),
        timeouts: batteryKeys.map(() => 60000),
        callback: (
          voltage: unknown,
          current: unknown,
          temperature: unknown,
          temperature1: unknown,
          stateOfCharge: unknown,
          timeRemaining: unknown,
          capacityRemaining: unknown,
          capacityActual: unknown,
          stateOfHealth: unknown,
          ripple: unknown
        ): N2KMessage[] => {
          const res: N2KMessage[] = []

          // Convert and validate numeric inputs
          const voltageNum = typeof voltage === 'number' ? voltage : null
          const currentNum = typeof current === 'number' ? current : null
          const tempNum = typeof temperature === 'number' ? temperature : null
          const temp1Num = typeof temperature1 === 'number' ? temperature1 : null
          const socNum = typeof stateOfCharge === 'number' ? stateOfCharge : null
          const timeRemainingNum = typeof timeRemaining === 'number' ? timeRemaining : null
          const capRemainingNum = typeof capacityRemaining === 'number' ? capacityRemaining : null
          const capActualNum = typeof capacityActual === 'number' ? capacityActual : null
          const sohNum = typeof stateOfHealth === 'number' ? stateOfHealth : null
          const rippleNum = typeof ripple === 'number' ? ripple : null

          // Prefer 'temperature' if available; otherwise fall back to 'Temperature1' (both are Kelvin)
          const tempOut = tempNum !== null ? tempNum : temp1Num

          // PGN 127508: Battery Status
          if (voltageNum !== null || currentNum !== null || tempOut !== null) {
            res.push({
              prio: 2,
              pgn: 127508,
              dst: 255,
              fields: {
                instance: battery.instanceId,
                voltage: voltageNum,
                current: currentNum,
                temperature: tempOut,
              },
            })
          }

          // Calculate timeRemaining if not provided: remaining [C] / discharge current [A] → seconds
          let computedTR: number | null = null
          if (timeRemainingNum === null) {
            // Prefer remainingC; if not available, derive from actual * SoC
            const remainingC = capRemainingNum !== null
              ? capRemainingNum
              : capActualNum !== null && socNum !== null
                ? capActualNum * socNum
                : null

            // Determine discharge current magnitude supporting either convention:
            // - positive current = discharging
            // - negative current = discharging
            let dischargeCurrentA: number | null = null
            if (currentNum !== null && Number.isFinite(currentNum)) {
              const threshold = 0.1
              if (currentNum > threshold) {
                dischargeCurrentA = currentNum // positive discharging
              } else if (currentNum < -threshold) {
                dischargeCurrentA = -currentNum // negative discharging
              }
            }

            if (
              remainingC !== null &&
              dischargeCurrentA !== null &&
              Number.isFinite(remainingC) &&
              Number.isFinite(dischargeCurrentA) &&
              dischargeCurrentA > 0
            ) {
              let seconds = Math.round(remainingC / dischargeCurrentA) // C / A = s
              const max = 30 * 24 * 3600 // cap at 30 days
              if (seconds < 0) seconds = 0
              if (seconds > max) seconds = max
              computedTR = seconds
            }
          }

          // PGN 127506: DC Detailed Status
          if (
            socNum !== null ||
            timeRemainingNum !== null ||
            computedTR !== null ||
            sohNum !== null ||
            rippleNum !== null
          ) {
            const adjustedStateOfCharge = socNum !== null ? socNum * 100 : null
            const adjustedStateOfHealth = sohNum !== null ? sohNum * 100 : null

            res.push({
              prio: 2,
              pgn: 127506,
              dst: 255,
              fields: {
                instance: battery.instanceId,
                dcType: "Battery",
                stateOfCharge: adjustedStateOfCharge,
                stateOfHealth: adjustedStateOfHealth,
                timeRemaining: timeRemainingNum !== null ? timeRemainingNum : computedTR,
                rippleVoltage: rippleNum,
              },
            })
          }

          return res
        },

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
                  timeRemaining: 12340,
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
                  timeRemaining: 18900,
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
                  timeRemaining: 18900,
                },
              },
            ],
          },
        ],
      }))
    },
  }
}
