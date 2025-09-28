import type { ConversionModule, N2KMessage, JSONSchema } from '../types/index.js'

/**
 * Temperature source configuration
 */
interface TemperatureInfo {
  n2kSource: string
  source: string
  instance: number
  option: string
}

/**
 * Temperature options interface
 */
interface TemperatureOptions {
  [key: string]: {
    instance?: number
  }
}

/**
 * Create a temperature message for NMEA 2000
 */
function createTemperatureMessage(pgn: number, temp: number, inst: number, src: string): N2KMessage {
  const fieldName = pgn === 130316 ? "temperature" : "actualTemperature"
  
  return {
    prio: 2,
    pgn,
    dst: 255,
    fields: {
      instance: inst,
      source: src,
      [fieldName]: temp,
    },
  }
}

/**
 * Create a temperature conversion module
 */
function makeTemperatureConversion(pgn: number, prefix: string, info: TemperatureInfo): ConversionModule {
  const optionKey = `${prefix}_${info.option}`
  
  return {
    title: `${info.n2kSource} (${pgn})`,
    optionKey,
    keys: [info.source],
    properties: (): JSONSchema['properties'] => ({
      instance: {
        title: "N2K Temperature Instance",
        type: "number",
        default: info.instance,
      },
    }),

    testOptions: [
      {
        [optionKey]: {
          instance: 0,
        },
      },
      {
        [optionKey]: {},
      },
    ],

    conversions: (options: unknown) => {
      const tempOptions = options as TemperatureOptions
      let instance = tempOptions[optionKey]?.instance
      if (instance === undefined) instance = info.instance

      return [
        {
          keys: [info.source],
          callback: (temperature: unknown): N2KMessage[] => {
            if (typeof temperature !== 'number') {
              return []
            }
            
            return [createTemperatureMessage(pgn, temperature, instance, info.n2kSource)]
          },
          tests: [
            {
              input: [281.2],
              expected: [
                (testOptions: Record<string, unknown>) => {
                  const testOption = testOptions[optionKey] as { instance?: number } | undefined
                  const expectedInstance = testOption?.instance !== undefined
                    ? testOption.instance
                    : info.instance
                  return createTemperatureMessage(pgn, 281.2, expectedInstance, info.n2kSource)
                },
              ],
            },
          ],
        },
      ]
    },
  }
}

/**
 * Temperature source configurations
 */
const temperatures: TemperatureInfo[] = [
  {
    n2kSource: "Outside Temperature",
    source: "environment.outside.temperature",
    instance: 101,
    option: "OUTSIDE",
  },
  {
    n2kSource: "Inside Temperature", 
    source: "environment.inside.temperature",
    instance: 102,
    option: "INSIDE",
  },
  {
    n2kSource: "Engine Room Temperature",
    source: "environment.inside.engineRoom.temperature",
    instance: 103,
    option: "ENGINEROOM",
  },
  {
    n2kSource: "Main Cabin Temperature",
    source: "environment.inside.mainCabin.temperature",
    instance: 107,
    option: "MAINCABIN",
  },
  {
    n2kSource: "Refrigeration Temperature",
    source: "environment.inside.refrigerator.temperature",
    instance: 107,
    option: "REFRIGERATOR",
  },
  {
    n2kSource: "Heating System Temperature",
    source: "environment.inside.heating.temperature",
    instance: 107,
    option: "HEATINGSYSTEM",
  },
  {
    n2kSource: "Dew Point Temperature",
    source: "environment.outside.dewPointTemperature",
    instance: 107,
    option: "DEWPOINT",
  },
  {
    n2kSource: "Apparent Wind Chill Temperature",
    source: "environment.outside.apparentWindChillTemperature",
    instance: 107,
    option: "APPARENTWINDCHILL",
  },
  {
    n2kSource: "Theoretical Wind Chill Temperature",
    source: "environment.outside.theoreticalWindChillTemperature",
    instance: 107,
    option: "THEORETICALWINDCHILL",
  },
  {
    n2kSource: "Heat Index Temperature",
    source: "environment.outside.heatIndexTemperature",
    instance: 107,
    option: "HEATINDEX",
  },
  {
    n2kSource: "Freezer Temperature",
    source: "environment.inside.freezer.temperature",
    instance: 107,
    option: "FREEZER",
  },
]

/**
 * Temperature conversion factory - creates multiple temperature conversion modules
 */
export default function createTemperatureConversions(): ConversionModule[] {
  return temperatures.flatMap((info) => [
    makeTemperatureConversion(130312, "TEMPERATURE", info),
    makeTemperatureConversion(130316, "TEMPERATURE2", info),
  ])
}
