import type { ConversionModule, N2KMessage, JSONSchema, SubConversionModule } from '../types/index.js'

const DEFAULT_TIMEOUT = 10000 // ms

/**
 * Engine configuration for exhaust temperature
 */
interface ExhaustTempEngineConfig {
  signalkId: string | number
  tempInstanceId: number
}

/**
 * Engine configuration for parameters
 */
interface EngineConfig {
  signalkId: string | number
  instanceId: number
}

/**
 * Engine parameters options
 */
interface EngineParametersOptions {
  EXHAUST_TEMPERATURE?: {
    engines: ExhaustTempEngineConfig[]
  }
  ENGINE_PARAMETERS?: {
    engines: EngineConfig[]
  }
}

/**
 * Engine parameters conversion modules - converts Signal K propulsion data to NMEA 2000 PGNs
 */
export default function createEngineParametersConversions(): ConversionModule[] {
  // discrete status fields are not yet implemented
  const engParKeys = [
    "oilPressure",
    "oilTemperature", 
    "temperature",
    "alternatorVoltage",
    "fuel.rate",
    "runTime",
    "coolantPressure",
    "fuel.pressure",
    "engineLoad",
    "engineTorque",
  ]

  const engRapidKeys = ["revolutions", "boostPressure", "drive.trimState"]

  return [
    {
      title: "Temperature, exhaust (130312)",
      optionKey: "EXHAUST_TEMPERATURE",
      context: "vessels.self",
      properties: (): JSONSchema['properties'] => ({
        engines: {
          title: "Engine Mapping",
          type: "array",
          items: {
            type: "object",
            properties: {
              signalkId: {
                title: "Signal K engine id",
                type: "string",
              },
              tempInstanceId: {
                title: "NMEA2000 Temperature Instance Id",
                type: "number",
              },
            },
          },
        },
      }),

      testOptions: {
        EXHAUST_TEMPERATURE: {
          engines: [
            {
              signalkId: 10,
              tempInstanceId: 1,
            },
          ],
        },
      },

      conversions: (options: unknown) => {
        const engineOptions = options as EngineParametersOptions
        if (!engineOptions?.EXHAUST_TEMPERATURE?.engines) {
          return null
        }

        return engineOptions.EXHAUST_TEMPERATURE?.engines.map((engine) => ({
          keys: [`propulsion.${engine.signalkId}.exhaustTemperature`],
          callback: (temperature: unknown): N2KMessage[] => {
            try {
              if (typeof temperature !== 'number') {
                return []
              }

              return [
                {
                  prio: 2,
                  pgn: 130312,
                  dst: 255,
                  fields: {
                    instance: engine.tempInstanceId,
                    actualTemperature: temperature,
                    source: "Exhaust Gas Temperature",
                  },
                },
              ]
            } catch (err) {
              console.error('Error in exhaust temperature conversion:', err)
              return []
            }
          },
          tests: [
            {
              input: [281.2],
              expected: [
                {
                  prio: 2,
                  pgn: 130312,
                  dst: 255,
                  fields: {
                    instance: 1,
                    actualTemperature: 281.2,
                    source: "Exhaust Gas Temperature",
                  },
                },
              ],
            },
          ],
        }))
      },
    },
    {
      title: "Engine Parameters (127489,127488)",
      optionKey: "ENGINE_PARAMETERS",
      context: "vessels.self",
      properties: (): JSONSchema['properties'] => ({
        engines: {
          title: "Engine Mapping",
          type: "array",
          items: {
            type: "object",
            properties: {
              signalkId: {
                title: "Signal K engine id",
                type: "string",
              },
              instanceId: {
                title: "NMEA2000 Engine Instance Id",
                type: "number",
              },
            },
          },
        },
      }),

      testOptions: {
        ENGINE_PARAMETERS: {
          engines: [
            {
              signalkId: 0,
              instanceId: 1,
            },
          ],
        },
      },

      conversions: (options: unknown) => {
        const engineOptions = options as EngineParametersOptions
        if (!engineOptions?.ENGINE_PARAMETERS?.engines) {
          return null
        }

        const dyn = engineOptions.ENGINE_PARAMETERS?.engines.map((engine) => ({
          keys: engParKeys.map((key) => `propulsion.${engine.signalkId}.${key}`),
          timeouts: engParKeys.map(() => DEFAULT_TIMEOUT),
          callback: (
            oilPres: unknown,
            oilTemp: unknown,
            temp: unknown,
            altVolt: unknown,
            fuelRate: unknown,
            runTime: unknown,
            coolPres: unknown,
            fuelPres: unknown,
            engLoad: unknown,
            engTorque: unknown
          ): N2KMessage[] => {
            try {
              // Convert and validate inputs
              const oilPressure = typeof oilPres === 'number' ? oilPres / 100 : null
              const oilTemperature = typeof oilTemp === 'number' ? oilTemp : null
              const temperature = typeof temp === 'number' ? temp : null
              const alternatorPotential = typeof altVolt === 'number' ? altVolt : null
              const fuelRateConverted = typeof fuelRate === 'number' ? fuelRate * 3600 * 1000 : null
              const totalEngineHours = typeof runTime === 'number' ? runTime : null
              const coolantPressure = typeof coolPres === 'number' ? coolPres / 100 : null
              const fuelPressure = typeof fuelPres === 'number' ? fuelPres / 100 : null
              const engineLoad = typeof engLoad === 'number' ? engLoad * 100 : null
              const engineTorque = typeof engTorque === 'number' ? engTorque * 100 : null

              return [
                {
                  prio: 2,
                  pgn: 127489,
                  dst: 255,
                  fields: {
                    instance: engine.instanceId,
                    oilPressure,
                    oilTemperature,
                    temperature,
                    alternatorPotential,
                    fuelRate: fuelRateConverted,
                    totalEngineHours,
                    coolantPressure,
                    fuelPressure,
                    discreteStatus1: [],
                    discreteStatus2: [],
                    engineLoad,
                    engineTorque,
                  },
                },
              ]
            } catch (err) {
              console.error('Error in engine parameters conversion:', err)
              return []
            }
          },
          tests: [
            {
              input: [102733, 210, 220, 13.1, 100, 201123, 202133, 11111111, 0.5, 1.0],
              expected: [
                {
                  prio: 2,
                  pgn: 127489,
                  dst: 255,
                  fields: {
                    instance: "Dual Engine Starboard",
                    oilPressure: 1000,
                    oilTemperature: 210,
                    temperature: 220,
                    alternatorPotential: 13.1,
                    fuelRate: -2355.2,
                    totalEngineHours: "55:52:03",
                    coolantPressure: 2000,
                    fuelPressure: 111000,
                    discreteStatus1: [],
                    discreteStatus2: [],
                    engineLoad: 50,
                    engineTorque: 100,
                  },
                },
              ],
            },
          ],
        }))

        const rapid = engineOptions.ENGINE_PARAMETERS?.engines.map((engine) => ({
          keys: engRapidKeys.map((key) => `propulsion.${engine.signalkId}.${key}`),
          timeouts: engRapidKeys.map(() => DEFAULT_TIMEOUT),
          callback: (
            revolutions: unknown,
            boostPressure: unknown,
            trimState: unknown
          ): N2KMessage[] => {
            try {
              // Convert and validate inputs
              const speed = typeof revolutions === 'number' ? revolutions * 60 : null
              const boostPres = typeof boostPressure === 'number' ? boostPressure / 100 : null
              const tiltTrim = typeof trimState === 'number' ? trimState * 100 : null

              return [
                {
                  prio: 2,
                  pgn: 127488,
                  dst: 255,
                  fields: {
                    instance: engine.instanceId,
                    speed,
                    boostPressure: boostPres,
                    tiltTrim,
                  },
                },
              ]
            } catch (err) {
              console.error('Error in engine rapid parameters conversion:', err)
              return []
            }
          },
          tests: [
            {
              input: [1001, 20345, 0.5],
              expected: [
                {
                  prio: 2,
                  pgn: 127488,
                  dst: 255,
                  fields: {
                    instance: "Dual Engine Starboard",
                    speed: 10908,
                    boostPressure: 200,
                    tiltTrim: 50,
                  },
                },
              ],
            },
          ],
        }))

        return [...dyn, ...rapid] as SubConversionModule[]
      },
    },
  ]
}
