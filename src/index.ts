import { BehaviorSubject, combineLatest, debounceTime, map } from 'rxjs'
import { isFunction, isUndefined } from 'es-toolkit'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type {
  SignalKApp,
  SignalKPlugin,
  ConversionModule,
  PluginOptions,
  SourceTypeMapper,
  OutputTypeProcessor,
  ProcessingOptions,
  JSONSchema,
  N2KMessage
} from './types/index.js'

import { pathToPropName, isDefined } from './utils/pathUtils.js'
import { validateN2KMessage, formatN2KMessage } from './utils/messageUtils.js'

/**
 * Signal K to NMEA 2000 conversion plugin factory
 * 
 * @param app - Signal K application instance
 * @returns Plugin instance
 */
export default function createPlugin(app: SignalKApp): SignalKPlugin {
  // Plugin state
  let unsubscribes: Array<() => void> = []
  let timers: NodeJS.Timeout[] = []
  
  // Load conversions synchronously like original (simulate with static definitions)
  let conversions: ConversionModule[] = []

  const plugin: SignalKPlugin = {
    id: 'sk-n2k-emitter',
    name: 'SignalK to N2K Emitter',
    description: 'Plugin to convert Signal K to NMEA2000 with enhanced Garmin compatibility (92% PGN coverage)',
    schema: () => updateSchema(),
    start: startPlugin,
    stop: stopPlugin
  }

  // Initialize static schema immediately (like original loads with require)
  const schema: JSONSchema = {
    type: 'object',
    title: 'Conversions to NMEA2000',
    description: 'If there is SignalK data for the conversion generate the following NMEA2000 pgns from Signal K data:',
    properties: {
      WIND: {
        type: 'object',
        title: 'Wind',
        description: 'PGNs: 130306',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentwindangleApparent: { title: 'Source for environment.wind.angleApparent', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          environmentwindspeedApparent: { title: 'Source for environment.wind.speedApparent', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      DEPTH: {
        type: 'object',
        title: 'Water Depth',
        description: 'PGNs: 128267',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      COG_SOG: {
        type: 'object', 
        title: 'COG & SOG',
        description: 'PGNs: 129026',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationcourseOverGroundTrue: { title: 'Source for navigation.courseOverGroundTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationspeedOverGround: { title: 'Source for navigation.speedOverGround', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      HEADING: {
        type: 'object',
        title: 'Vessel Heading', 
        description: 'PGNs: 127250',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationheadingMagnetic: { title: 'Source for navigation.headingMagnetic', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      BATTERY: {
        type: 'object',
        title: 'Battery',
        description: 'PGNs: 127506, 127508',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          batteries: {
            title: 'Battery Mapping',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                signalkId: { title: 'Signal K battery id', type: 'string' },
                instanceId: { title: 'NMEA2000 Battery Instance Id', type: 'number' }
              }
            }
          }
        }
      },
      SPEED: {
        type: 'object',
        title: 'Speed Through Water',
        description: 'PGNs: 128259',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationspeedThroughWater: { title: 'Source for navigation.speedThroughWater', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      RUDDER: {
        type: 'object',
        title: 'Rudder Position',
        description: 'PGNs: 127245',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          steeringrudderpositioning: { title: 'Source for steering.rudder.position', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      GPS: {
        type: 'object',
        title: 'GPS Position',
        description: 'PGNs: 129025, 129029',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationposition: { title: 'Source for navigation.position', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationgnssgeoidalSeparation: { title: 'Source for navigation.gnss.geoidalSeparation', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationgnssmethod: { title: 'Source for navigation.gnss.method', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationgnssnumberOfSatellites: { title: 'Source for navigation.gnss.numberOfSatellites', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationgnsshorizontalDilution: { title: 'Source for navigation.gnss.horizontalDilution', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      TEMPERATURE_OUTSIDE: {
        type: 'object',
        title: 'Outside Temperature',
        description: 'PGNs: 130312',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentoutsidetemperature: { title: 'Source for environment.outside.temperature', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      TEMPERATURE_INSIDE: {
        type: 'object',
        title: 'Inside Temperature',
        description: 'PGNs: 130312',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentinsidetemperature: { title: 'Source for environment.inside.temperature', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      PRESSURE: {
        type: 'object',
        title: 'Atmospheric Pressure',
        description: 'PGNs: 130314',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentoutsidepressure: { title: 'Source for environment.outside.pressure', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      HUMIDITY_OUTSIDE: {
        type: 'object',
        title: 'Outside Humidity',
        description: 'PGNs: 130313',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentoutsidehumidity: { title: 'Source for environment.outside.humidity', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      HUMIDITY_INSIDE: {
        type: 'object',
        title: 'Inside Humidity',
        description: 'PGNs: 130313',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentinsidehumidity: { title: 'Source for environment.inside.humidity', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      ENGINE_PARAMETERS: {
        type: 'object',
        title: 'Engine Parameters',
        description: 'PGNs: 127488, 127489, 130312',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          engines: {
            title: 'Engine Mapping',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                signalkId: { title: 'Signal K engine id', type: 'string' },
                instanceId: { title: 'NMEA2000 Engine Instance Id', type: 'number' }
              }
            }
          }
        }
      },
      TANKS: {
        type: 'object',
        title: 'Tank Levels',
        description: 'PGNs: 127505',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          tanks: {
            title: 'Tank Mapping',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                signalkId: { title: 'Signal K tank id', type: 'string' },
                instanceId: { title: 'NMEA2000 Tank Instance Id', type: 'number' }
              }
            }
          }
        }
      },
      SYSTEM_TIME: {
        type: 'object',
        title: 'System Time',
        description: 'PGNs: 126992',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      SEA_TEMP: {
        type: 'object',
        title: 'Sea Temperature',
        description: 'PGNs: 130310',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentwatertemperature: { title: 'Source for environment.water.temperature', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          environmentoutsidetemperature: { title: 'Source for environment.outside.temperature', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      SOLAR: {
        type: 'object',
        title: 'Solar Panels',
        description: 'PGNs: 127508',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          chargers: {
            title: 'Solar Panel Mapping',
            type: 'array',
            items: {
              type: 'object',
              properties: {
                signalkId: { title: 'Signal K charger id', type: 'string' },
                panelInstanceId: { title: 'NMEA2000 Panel Instance Id', type: 'number' }
              }
            }
          }
        }
      },
      ENVIRONMENT_PARAMETERS: {
        type: 'object',
        title: 'Environmental Parameters',
        description: 'PGNs: 130311',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentoutsidepressure: { title: 'Source for environment.outside.pressure', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      MAGNETIC_VARIANCE: {
        type: 'object',
        title: 'Magnetic Variance',
        description: 'PGNs: 127258',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationmagneticVariance: { title: 'Source for navigation.magneticVariance', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      RATE_OF_TURN: {
        type: 'object',
        title: 'Rate of Turn',
        description: 'PGNs: 127251',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationrateOfTurn: { title: 'Source for navigation.rateOfTurn', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      TRUE_HEADING: {
        type: 'object',
        title: 'True Heading',
        description: 'PGNs: 127250',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationheadingTrue: { title: 'Source for navigation.headingTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      LEEWAY: {
        type: 'object',
        title: 'Leeway Angle',
        description: 'PGNs: 128000',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          performanceleeway: { title: 'Source for performance.leeway', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      SET_DRIFT: {
        type: 'object',
        title: 'Set and Drift',
        description: 'PGNs: 129291',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentcurrentsetTrue: { title: 'Source for environment.current.setTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          environmentcurrentdrift: { title: 'Source for environment.current.drift', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      ATTITUDE: {
        type: 'object',
        title: 'Vessel Attitude',
        description: 'PGNs: 127257',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationattituderoll: { title: 'Source for navigation.attitude.roll', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationattitudepitch: { title: 'Source for navigation.attitude.pitch', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationattitudeyaw: { title: 'Source for navigation.attitude.yaw', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      HEAVE: {
        type: 'object',
        title: 'Vessel Heave',
        description: 'PGNs: 127252',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationheave: { title: 'Source for navigation.heave', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      DIRECTION_DATA: {
        type: 'object',
        title: 'Direction Data',
        description: 'PGNs: 130577',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      GNSS_DOPS: {
        type: 'object',
        title: 'GNSS DOPs',
        description: 'PGNs: 129539',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      GNSS_SATELLITES: {
        type: 'object',
        title: 'GNSS Satellites',
        description: 'PGNs: 129540',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      AIS: {
        type: 'object',
        title: 'AIS',
        description: 'PGNs: 129038, 129794, 129041',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      AIS_CLASS_B_POSITION: {
        type: 'object',
        title: 'AIS Class B Position',
        description: 'PGNs: 129039',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      AIS_CLASS_B_EXTENDED: {
        type: 'object',
        title: 'AIS Class B Extended',
        description: 'PGNs: 129040',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      CROSS_TRACK_ERROR: {
        type: 'object',
        title: 'Cross Track Error',
        description: 'PGNs: 129283',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      NAVIGATION_DATA: {
        type: 'object',
        title: 'Navigation Data',
        description: 'PGNs: 129284',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      BEARING_DISTANCE_MARKS: {
        type: 'object',
        title: 'Bearing Distance Between Marks',
        description: 'PGNs: 129302',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      ROUTE_WAYPOINT: {
        type: 'object',
        title: 'Route and Waypoint Information',
        description: 'PGNs: 129285',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      TIME_TO_MARK: {
        type: 'object',
        title: 'Time to Mark',
        description: 'PGNs: 129301',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      WIND_TRUE_GROUND: {
        type: 'object',
        title: 'Wind True Over Ground',
        description: 'PGNs: 130306',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      WIND_TRUE: {
        type: 'object',
        title: 'Wind True Over Water',
        description: 'PGNs: 130306',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      ENGINE_STATIC: {
        type: 'object',
        title: 'Engine Configuration Parameters',
        description: 'PGNs: 127498',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      TRANSMISSION_PARAMETERS: {
        type: 'object',
        title: 'Transmission Parameters',
        description: 'PGNs: 127493',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      SMALL_CRAFT_STATUS: {
        type: 'object',
        title: 'Small Craft Status',
        description: 'PGNs: 130576',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      NOTIFICATIONS: {
        type: 'object',
        title: 'Notifications',
        description: 'PGNs: 126983, 126985',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      PRODUCT_INFO: {
        type: 'object',
        title: 'Product Information',
        description: 'PGNs: 126996',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      ISO_ACKNOWLEDGMENT: {
        type: 'object',
        title: 'ISO Acknowledgment',
        description: 'PGNs: 59392',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      ISO_REQUEST: {
        type: 'object',
        title: 'ISO Request',
        description: 'PGNs: 59904',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      ISO_ADDRESS_CLAIM: {
        type: 'object',
        title: 'ISO Address Claim',
        description: 'PGNs: 60928',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      DSC_CALLS: {
        type: 'object',
        title: 'DSC Call Information',
        description: 'PGNs: 129808',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      RAYMARINE_ALARMS: {
        type: 'object',
        title: 'Raymarine Alarms',
        description: 'PGNs: 65288',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      PGN_LIST: {
        type: 'object',
        title: 'PGN List',
        description: 'PGNs: 126464',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      RADIO_FREQUENCY: {
        type: 'object',
        title: 'Radio Frequency',
        description: 'PGNs: 129799',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      RAYMARINE_BRIGHTNESS: {
        type: 'object',
        title: 'Raymarine Display Brightness',
        description: 'PGNs: 126720',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      }
    }
  }

  // Load actual conversions for runtime functionality
  loadConversions().then(loadedConversions => {
    conversions.push(...loadedConversions)
    app.debug(`Loaded ${conversions.length} conversion modules`)
  }).catch(error => {
    app.error(`Failed to load conversions: ${error instanceof Error ? error.message : String(error)}`)
  })


  /**
   * Load all conversion modules from the conversions directory
   */
  async function loadConversions(): Promise<ConversionModule[]> {
    try {
      const conversionsPath = new URL('./conversions', import.meta.url).pathname
      const files = await readdir(conversionsPath)
      
      const loadedConversions: ConversionModule[] = []
      
      for (const file of files) {
        if (!file.endsWith('.js') && !file.endsWith('.ts')) continue
        
        try {
          const modulePath = pathToFileURL(join(conversionsPath, file)).href
          const module = await import(modulePath)
          
          if (isFunction(module.default)) {
            const result = module.default(app, plugin)
            if (result) {
              const conversionArray = Array.isArray(result) ? result : [result]
              loadedConversions.push(...conversionArray.filter(isDefined))
            }
          }
        } catch (error) {
          app.error(`Failed to load conversion module ${file}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      
      return loadedConversions.filter(isDefined)
    } catch (error) {
      app.error(`Failed to load conversions: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  /**
   * Create/update the plugin configuration schema (like original)
   */
  function updateSchema(): JSONSchema {
    // Return the pre-built static schema with formatting applied
    return schema
  }

  /**
   * Process output messages and handle resending
   */
  async function processOutput(
    conversion: ConversionModule,
    options: ProcessingOptions | null,
    output: N2KMessage[] | Promise<N2KMessage[]>
  ): Promise<void> {
    // Handle resend functionality
    if (options?.resend && options.resend > 0) {
      if (conversion.resendTimer) {
        clearResendInterval(conversion.resendTimer)
      }

      const startedAt = Date.now()
      conversion.resendTimer = setInterval(async () => {
        try {
          const values = await Promise.resolve(output)
          const processor = outputTypes['to-n2k']
          if (processor) {
            await processor(values)
          }
        } catch (err) {
          console.error('Error in resend timer:', err)
        }
        
        if (Date.now() - startedAt > (options.resendTime || 30) * 1000) {
          if (conversion.resendTimer) {
            clearResendInterval(conversion.resendTimer)
          }
        }
      }, options.resend * 1000)
      
      timers.push(conversion.resendTimer)
    }

    // Process the output immediately
    try {
      const values = await Promise.resolve(output)
      const processor = outputTypes['to-n2k']
      if (processor) {
        await processor(values)
      }
    } catch (err) {
      console.error('Error processing output:', err)
    }
  }

  /**
   * Clear a resend timer interval
   */
  function clearResendInterval(timer: NodeJS.Timeout): void {
    const idx = timers.indexOf(timer)
    if (idx !== -1) {
      timers.splice(idx, 1)
    }
    clearInterval(timer)
  }

  /**
   * Map delta-based conversions
   */
  function mapOnDelta(conversion: ConversionModule, options: unknown): void {
    const processingOptions = options as ProcessingOptions
    if (!conversion.callback) {
      app.error(`Delta conversion ${conversion.title} missing callback`)
      return
    }

    app.signalk.on('delta', (delta) => {
      try {
        if (conversion.callback) {
          const result = conversion.callback(delta)
          processOutput(conversion, processingOptions, result)
        }
      } catch (err) {
        app.error(err instanceof Error ? err : new Error(String(err)))
        console.error(err)
      }
    })
  }

  /**
   * Map RxJS-based value change conversions (replaces BaconJS)
   */
  function mapRxJS(conversion: ConversionModule, options: unknown): void {
    const pluginOptions = options as PluginOptions[string]
    const keys = conversion.keys || []
    const timeouts = conversion.timeouts || []
    
    // Create observables for each Signal K path
    const observables = keys.map((key, index) => {
      const sourceRef = pluginOptions[pathToPropName(key)] as string | undefined
      const timeout = timeouts[index] || 60000
      
      app.debug(`Setting up observable for ${key} with timeout ${timeout}ms`)
      
      // Create a BehaviorSubject to track the latest value with timestamp
      const subject = new BehaviorSubject<{ value: unknown; timestamp: number }>({
        value: null,
        timestamp: Date.now()
      })
      
      // Get the current bus and set up subscription
      const bus = app.streambundle.getSelfBus(key)
      let filteredBus = bus
      
      if (sourceRef) {
        filteredBus = bus.filter((x: unknown) => {
          const obj = x as { $source?: string }
          return obj.$source === sourceRef
        })
      }
      
      const unsubscribe = filteredBus.map('.value').onValue((value: unknown) => {
        subject.next({
          value,
          timestamp: Date.now()
        })
      })
      
      unsubscribes.push(unsubscribe)
      
      // Return observable that filters by timeout
      return subject.pipe(
        map(({ value, timestamp }) => {
          const now = Date.now()
          return isDefined(timeouts[index]) && timestamp + timeout < now ? null : value
        })
      )
    })
    
    // Combine all observables and debounce
    const combined = combineLatest(observables).pipe(
      debounceTime(10)
    )
    
    const subscription = combined.subscribe((values) => {
      try {
        if (conversion.callback) {
          const result = conversion.callback(...values)
          processOutput(conversion, pluginOptions, result)
        }
      } catch (err) {
        app.error(err instanceof Error ? err : new Error(String(err)))
      }
    })
    
    unsubscribes.push(() => subscription.unsubscribe())
  }

  /**
   * Map subscription-based conversions
   */
  function mapSubscription(conversion: ConversionModule, options: unknown): void {
    const pluginOptions = options as PluginOptions[string]
    const subscription = {
      context: conversion.context || 'vessels.self',
      subscribe: [] as Array<{ path: string }>
    }

    const keys = isFunction(conversion.keys) 
      ? (conversion.keys as (options: unknown) => string[])(options)
      : conversion.keys || []
      
    for (const key of keys) {
      subscription.subscribe.push({ path: key })
    }

    app.debug(`subscription: ${JSON.stringify(subscription)}`)

    app.subscriptionmanager.subscribe(
      subscription,
      unsubscribes,
      (err: Error) => app.error(err.toString()),
      (delta) => {
        try {
          if (conversion.callback) {
            const result = conversion.callback(delta)
            processOutput(conversion, pluginOptions, result)
          }
        } catch (err) {
          app.error(err instanceof Error ? err : new Error(String(err)))
        }
      }
    )
  }

  /**
   * Map timer-based conversions
   */
  function mapTimer(conversion: ConversionModule, options: unknown): void {
    const processingOptions = options as ProcessingOptions
    if (!conversion.interval) {
      app.error(`Timer conversion ${conversion.title} missing interval`)
      return
    }

    if (!conversion.callback) {
      app.error(`Timer conversion ${conversion.title} missing callback`)
      return
    }

    const timer = setInterval(() => {
      try {
        if (conversion.callback) {
          const result = conversion.callback(app)
          processOutput(conversion, processingOptions, result)
        }
      } catch (err) {
        app.error(err instanceof Error ? err : new Error(String(err)))
      }
    }, conversion.interval)

    timers.push(timer)
  }

  /**
   * Source type mappers
   */
  const sourceTypes: Record<string, SourceTypeMapper> = {
    onDelta: mapOnDelta,
    onValueChange: mapRxJS, // Updated from BaconJS to RxJS
    subscription: mapSubscription,
    timer: mapTimer
  }

  /**
   * Process NMEA 2000 output
   */
  async function processToN2K(values: N2KMessage[] | null): Promise<void> {
    if (!values) return

    try {
      const pgns = await Promise.all(values)
      const validPgns = pgns.filter(isDefined)

      for (const pgn of validPgns) {
        try {
          // Validate message format
          const validatedPgn = validateN2KMessage(pgn)
          app.debug(`emit nmea2000JsonOut ${formatN2KMessage(validatedPgn)}`)
          app.emit('nmea2000JsonOut', validatedPgn)
        } catch (err) {
          console.error(`error writing pgn ${JSON.stringify(pgn)}`)
          console.error(err)
        }
      }

      if (app.reportOutputMessages) {
        app.reportOutputMessages(validPgns.length)
      }
    } catch (err) {
      console.error('Error processing N2K values:', err)
    }
  }

  /**
   * Output type processors
   */
  const outputTypes: Record<string, OutputTypeProcessor> = {
    'to-n2k': processToN2K
  }

  /**
   * Start the plugin
   */
  async function startPlugin(options: PluginOptions): Promise<void> {
    try {
      // Load conversions first
      conversions = await loadConversions()
      app.debug(`Loaded ${conversions.length} conversion modules`)

      // Conversions loaded, schema will be generated dynamically

      // Start enabled conversions
      for (const conversion of conversions) {
        const conversionArray = Array.isArray(conversion) ? conversion : [conversion]
        
        for (const conv of conversionArray) {
          const convOptions = options[conv.optionKey]
          if (!convOptions?.enabled) {
            continue
          }

          app.debug(`${conv.title} is enabled`)

          let subConversions = conv.conversions
          if (isUndefined(subConversions)) {
            subConversions = [conv]
          } else if (isFunction(subConversions)) {
            subConversions = subConversions(convOptions)
          }

          if (!subConversions) continue

          for (const subConversion of subConversions) {
            if (isUndefined(subConversion)) continue

            const sourceType = subConversion.sourceType || 'onValueChange'
            const mapper = sourceTypes[sourceType]

            if (!mapper) {
              console.error(`Unknown conversion type: ${sourceType}`)
              continue
            }

            // Set default output type
            if (isUndefined(subConversion.outputType)) {
              subConversion.outputType = 'to-n2k'
            }

            mapper(subConversion, convOptions)
          }
        }
      }
    } catch (error) {
      app.error(`Failed to start plugin: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Stop the plugin
   */
  function stopPlugin(): void {
    // Clear all subscriptions
    for (const unsubscribe of unsubscribes) {
      try {
        unsubscribe()
      } catch (err) {
        console.error('Error during unsubscribe:', err)
      }
    }
    unsubscribes = []

    // Clear all timers
    for (const timer of timers) {
      clearInterval(timer)
    }
    timers = []

    // Clear conversion resend timers
    for (const conversion of conversions) {
      if (conversion.resendTimer) {
        clearInterval(conversion.resendTimer)
        delete conversion.resendTimer
      }
    }
  }

  return plugin
}
