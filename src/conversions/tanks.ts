import type { ConversionModule, N2KMessage, SignalKApp, JSONSchema } from '../types/index.js'

/**
 * Tank type mapping from Signal K to NMEA 2000
 */
const typeMapping: Record<string, string> = {
  fuel: "Fuel",
  blackWater: "Black water",
  freshWater: "Water",
  wasteWater: "Gray water",
  greyWater: "Gray water",
  grayWater: "Gray water",
  liveWell: "Live well",
  lubrication: "Oil",
  gas: "Fuel",
}

/**
 * Tank configuration interface
 */
interface TankConfig {
  signalkPath: string
  instanceId: number
}

/**
 * Tank options interface
 */
interface TankOptions {
  TANKS: {
    tanks: TankConfig[]
  }
}

/**
 * Tank levels conversion module - converts Signal K tank data to NMEA 2000 PGN 127505
 */
export default function createTanksConversion(app: SignalKApp): ConversionModule {
  return {
    title: "Tank Levels (127505)",
    optionKey: "TANKS",
    context: "vessels.self",
    properties: (): JSONSchema['properties'] | undefined => {
      // Get tanks from Signal K self vessel data
      const self = app.getSelfPath('') as Record<string, unknown> | undefined
      const tanks = self?.tanks as Record<string, unknown> | undefined
      const tankPaths: string[] = []
      
      if (tanks && typeof tanks === 'object') {
        Object.keys(tanks).forEach((type) => {
          const tankType = tanks[type] as Record<string, unknown> | undefined
          if (tankType && typeof tankType === 'object') {
            Object.keys(tankType).forEach((instance) => {
              tankPaths.push(`tanks.${type}.${instance}`)
            })
          }
        })
      }

      return tankPaths.length === 0
        ? undefined
        : {
            tanks: {
              title: "Tank Mapping",
              type: "array",
              items: {
                type: "object",
                properties: {
                  signalkPath: {
                    title: "Tank Path",
                    type: "string",
                    enum: tankPaths,
                  },
                  instanceId: {
                    title: "NMEA2000 Tanks Instance Id",
                    type: "number",
                  },
                },
              },
            },
          }
    },

    testOptions: {
      TANKS: {
        tanks: [
          {
            signalkPath: "tanks.fuel.0",
            instanceId: 1,
          },
        ],
      },
    },

    conversions: (options: unknown) => {
      const tankOptions = options as TankOptions
      if (!tankOptions?.TANKS?.tanks) {
        return null
      }

      const validConversions = tankOptions.TANKS.tanks.map((tank) => {
        const split = tank.signalkPath.split(".")
        const tankType = split[1]
        
        if (!tankType) {
          const msg = `Invalid tank path: ${tank.signalkPath}`
          app.error(msg)
          return null
        }
        
        const type = typeMapping[tankType]
        
        if (type) {
          return {
            keys: [`${tank.signalkPath}.currentLevel`, `${tank.signalkPath}.capacity`],
            timeouts: [60000, 60000],
            callback: (currentLevel: unknown, capacity: unknown): N2KMessage[] => {
              try {
                // Validate inputs
                const level = typeof currentLevel === 'number' ? currentLevel : null
                const cap = typeof capacity === 'number' ? capacity : null

                if (level === null && cap === null) {
                  return []
                }

                return [
                  {
                    prio: 2,
                    pgn: 127505,
                    dst: 255,
                    fields: {
                      instance: tank.instanceId,
                      type,
                      level: level !== null ? level * 100 : null,
                      capacity: cap !== null ? cap * 1000 : null,
                    },
                  },
                ]
              } catch (err) {
                console.error('Error in tank conversion:', err)
                return []
              }
            },
            tests: [
              {
                input: [0.35, 0.012],
                expected: [
                  {
                    prio: 2,
                    pgn: 127505,
                    dst: 255,
                    fields: {
                      instance: 1,
                      type: "Fuel",
                      level: 35,
                      capacity: 12,
                    },
                  },
                ],
              },
            ],
          }
        } else {
          const msg = `unknown tank type: ${tankType}`
          app.error(msg)
          return null
        }
      })

      return validConversions.filter((conv): conv is NonNullable<typeof conv> => conv !== null)
    },
  }
}
