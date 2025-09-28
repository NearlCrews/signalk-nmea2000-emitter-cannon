import { BehaviorSubject, debounceTime } from 'rxjs'
import { isFunction, isUndefined } from 'es-toolkit'

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

// Import all conversion modules statically
import createWindConversion from './conversions/wind.js'
import createDepthConversion from './conversions/depth.js'
import createCogSogConversion from './conversions/cogSOG.js'
import createHeadingConversion from './conversions/heading.js'
import createBatteryConversion from './conversions/battery.js'
import createSpeedConversion from './conversions/speed.js'
import createRudderConversion from './conversions/rudder.js'
import createGpsConversion from './conversions/gps.js'
import createTemperatureConversion from './conversions/temperature.js'
import createPressureConversion from './conversions/pressure.js'
import createHumidityConversion from './conversions/humidity.js'
import createEngineParametersConversion from './conversions/engineParameters.js'
import createTanksConversion from './conversions/tanks.js'
import createSystemTimeConversion from './conversions/systemTime.js'
import createSeaTempConversion from './conversions/seaTemp.js'
import createSolarConversion from './conversions/solar.js'
import createEnvironmentParametersConversion from './conversions/environmentParameters.js'
import createMagneticVarianceConversion from './conversions/magneticVariance.js'
import createRateOfTurnConversion from './conversions/rateOfTurn.js'
import createTrueHeadingConversion from './conversions/trueheading.js'
import createLeewayConversion from './conversions/leeway.js'
import createSetDriftConversion from './conversions/setdrift.js'
import createAttitudeConversion from './conversions/attitude.js'
import createHeaveConversion from './conversions/heave.js'
import createDirectionDataConversion from './conversions/directionData.js'
import createGnssDataConversion from './conversions/gnssData.js'
import createRouteWaypointConversion from './conversions/routeWaypoint.js'
import createRouteWpListConversion from './conversions/routeWpList.js'
import createTimeToMarkConversion from './conversions/timeToMark.js'
import createWindTrueGroundConversion from './conversions/windTrueGround.js'
import createWindTrueWaterConversion from './conversions/windTrueWater.js'
import createEngineStaticConversion from './conversions/engineStatic.js'
import createTransmissionParametersConversion from './conversions/transmissionParameters.js'
import createSmallCraftStatusConversion from './conversions/smallCraftStatus.js'
import createProductInfoConversion from './conversions/productInfo.js'
import createIsoMessagesConversion from './conversions/isoMessages.js'
import createRaymarineAlarmsConversion from './conversions/raymarineAlarms.js'
import createPgnListConversion from './conversions/pgnList.js'
import createNavigationDataConversion from './conversions/navigationData.js'
import createDscCallsConversion from './conversions/dscCalls.js'
import createAisExtendedConversion from './conversions/aisExtended.js'
import createBearingDistanceBetweenMarksConversion from './conversions/bearingDistanceBetweenMarks.js'
import createRadioFrequencyConversion from './conversions/radioFrequency.js'
import createRaymarineBrightnessConversion from './conversions/raymarineBrightness.js'
import createAisConversion from './conversions/ais.js'
import createNotificationsConversion from './conversions/notifications.js'

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
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentdepthbelowTransducer: { title: 'Source for environment.depth.belowTransducer', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
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
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationcourseOverGroundTrue: { title: 'Source for navigation.courseOverGroundTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcourseOverGroundMagnetic: { title: 'Source for navigation.courseOverGroundMagnetic', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationheadingTrue: { title: 'Source for navigation.headingTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationheadingMagnetic: { title: 'Source for navigation.headingMagnetic', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcourseRhumblinenextPointbearingTrue: { title: 'Source for navigation.courseRhumbline.nextPoint.bearingTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcourseRhumblinenextPointbearingMagnetic: { title: 'Source for navigation.courseRhumbline.nextPoint.bearingMagnetic', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcourseGreatCirclenextPointbearingTrue: { title: 'Source for navigation.courseGreatCircle.nextPoint.bearingTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcourseGreatCirclenextPointbearingMagnetic: { title: 'Source for navigation.courseGreatCircle.nextPoint.bearingMagnetic', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      GNSS_DOPS: {
        type: 'object',
        title: 'GNSS DOPs',
        description: 'PGNs: 129539',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationgnsshorizontalDilution: { title: 'Source for navigation.gnss.horizontalDilution', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationgnssverticalDilution: { title: 'Source for navigation.gnss.verticalDilution', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationgnsstitimeDilution: { title: 'Source for navigation.gnss.timeDilution', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationgnssmode: { title: 'Source for navigation.gnss.mode', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      GNSS_SATELLITES: {
        type: 'object',
        title: 'GNSS Satellites',
        description: 'PGNs: 129540',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationgnsssatellitesInViewcount: { title: 'Source for navigation.gnss.satellitesInView.count', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationgnsssatellitesInViewsatellites: { title: 'Source for navigation.gnss.satellitesInView.satellites', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
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
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationcoursecalcValuescrossTrackError: { title: 'Source for navigation.course.calcValues.crossTrackError', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      NAVIGATION_DATA: {
        type: 'object',
        title: 'Navigation Data',
        description: 'PGNs: 129284',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationcoursecalcValuesdistance: { title: 'Source for navigation.course.calcValues.distance', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcoursecalcValuesbearing: { title: 'Source for navigation.course.calcValues.bearing', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcoursecalcValuesvelocityMadeGood: { title: 'Source for navigation.course.calcValues.velocityMadeGood', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcoursecalcValueseta: { title: 'Source for navigation.course.calcValues.eta', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      BEARING_DISTANCE_MARKS: {
        type: 'object',
        title: 'Bearing Distance Between Marks',
        description: 'PGNs: 129302',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationcoursenextPointbearingMagnetic: { title: 'Source for navigation.course.nextPoint.bearingMagnetic', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcoursenextPointdistance: { title: 'Source for navigation.course.nextPoint.distance', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      ROUTE_WAYPOINT: {
        type: 'object',
        title: 'Route and Waypoint Information',
        description: 'PGNs: 129285',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationcoursenextPointposition: { title: 'Source for navigation.course.nextPoint.position', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationcoursenextPointdistance: { title: 'Source for navigation.course.nextPoint.distance', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      TIME_TO_MARK: {
        type: 'object',
        title: 'Time to Mark',
        description: 'PGNs: 129301',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          navigationcoursenextPointtimeToGo: { title: 'Source for navigation.course.nextPoint.timeToGo', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      WIND_TRUE_GROUND: {
        type: 'object',
        title: 'Wind True Over Ground',
        description: 'PGNs: 130306',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentwinddirectionTrue: { title: 'Source for environment.wind.directionTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          environmentwindspeedOverGround: { title: 'Source for environment.wind.speedOverGround', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      WIND_TRUE: {
        type: 'object',
        title: 'Wind True Over Water',
        description: 'PGNs: 130306',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          environmentwindangleTrueWater: { title: 'Source for environment.wind.angleTrueWater', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          environmentwindspeedTrue: { title: 'Source for environment.wind.speedTrue', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      ENGINE_STATIC: {
        type: 'object',
        title: 'Engine Configuration Parameters',
        description: 'PGNs: 127498',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          propulsionmainratedEngineSpeed: { title: 'Source for propulsion.main.ratedEngineSpeed', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          propulsionmainengineoperatingHours: { title: 'Source for propulsion.main.engine.operatingHours', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      TRANSMISSION_PARAMETERS: {
        type: 'object',
        title: 'Transmission Parameters',
        description: 'PGNs: 127493',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          propulsionmaintransmissiongearRatio: { title: 'Source for propulsion.main.transmission.gearRatio', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          propulsionmaintransmissionoilPressure: { title: 'Source for propulsion.main.transmission.oilPressure', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          propulsionmaintransmissionoilTemperature: { title: 'Source for propulsion.main.transmission.oilTemperature', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
        }
      },
      SMALL_CRAFT_STATUS: {
        type: 'object',
        title: 'Small Craft Status',
        description: 'PGNs: 130576',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 },
          steeringtrimTabport: { title: 'Source for steering.trimTab.port', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          steeringtrimTabstarboard: { title: 'Source for steering.trimTab.starboard', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          environmentdepthbelowTransducer: { title: 'Source for environment.depth.belowTransducer', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' },
          navigationspeedOverGround: { title: 'Source for navigation.speedOverGround', description: 'Use data only from this source (leave blank to ignore source)', type: 'string' }
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

  // Load conversions using static imports (bundled approach)
  function loadConversions(): ConversionModule[] {
    const conversionFactories = [
      createWindConversion,
      createDepthConversion,
      createCogSogConversion,
      createHeadingConversion,
      createBatteryConversion,
      createSpeedConversion,
      createRudderConversion,
      createGpsConversion,
      createTemperatureConversion,
      createPressureConversion,
      createHumidityConversion,
      createEngineParametersConversion,
      createTanksConversion,
      createSystemTimeConversion,
      createSeaTempConversion,
      createSolarConversion,
      createEnvironmentParametersConversion,
      createMagneticVarianceConversion,
      createRateOfTurnConversion,
      createTrueHeadingConversion,
      createLeewayConversion,
      createSetDriftConversion,
      createAttitudeConversion,
      createHeaveConversion,
      createDirectionDataConversion,
      createGnssDataConversion,
      createRouteWaypointConversion,
      createRouteWpListConversion,
      createTimeToMarkConversion,
      createWindTrueGroundConversion,
      createWindTrueWaterConversion,
      createEngineStaticConversion,
      createTransmissionParametersConversion,
      createSmallCraftStatusConversion,
      createProductInfoConversion,
      createIsoMessagesConversion,
      createRaymarineAlarmsConversion,
      createPgnListConversion,
      createNavigationDataConversion,
      createDscCallsConversion,
      createAisExtendedConversion,
      createBearingDistanceBetweenMarksConversion,
      createRadioFrequencyConversion,
      createRaymarineBrightnessConversion,
      createAisConversion,
      createNotificationsConversion
    ]
    
    const loadedConversions: ConversionModule[] = []
    
    for (const factory of conversionFactories) {
      try {
        if (isFunction(factory)) {
          const result = factory(app, plugin)
          if (result) {
            const conversionArray = Array.isArray(result) ? result : [result]
            loadedConversions.push(...conversionArray.filter(isDefined))
          }
        }
      } catch (error) {
        app.error(`Failed to load conversion: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    return loadedConversions.filter(isDefined)
  }

  // Load conversions synchronously at plugin creation
  conversions = loadConversions()
  app.debug(`Loaded ${conversions.length} conversion modules at plugin creation`)

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
   * Map Signal K stream-based value change conversions using BaconJS-like pattern
   */
  function mapRxJS(conversion: ConversionModule, options: unknown): void {
    const pluginOptions = options as PluginOptions[string]
    const keys = conversion.keys || []
    const timeouts = conversion.timeouts || []
    
    app.debug(`Setting up conversion: ${conversion.title} with keys: ${JSON.stringify(keys)}`)
    app.debug(`Timeouts: ${JSON.stringify(timeouts)}`)
    
    // Replicate the original BaconJS timeoutingArrayStream pattern
    const lastValues: Record<string, { timestamp: number; value: unknown }> = {}
    
    // Initialize lastValues for all keys
    keys.forEach(key => {
      lastValues[key] = {
        timestamp: Date.now(),
        value: null
      }
    })
    
    // Create a subject to combine all streams (like Bacon.Bus)
    const combinedBus = new BehaviorSubject<unknown[]>([])
    
    // Set up individual stream subscriptions
    keys.forEach(skKey => {
      const sourceRef = pluginOptions[pathToPropName(skKey)] as string | undefined
      app.debug(`Setting up ${skKey} with sourceRef: ${sourceRef}`)
      
      let bus = app.streambundle.getSelfBus(skKey)
      
      if (sourceRef) {
        bus = bus.filter((x: unknown) => {
          const obj = x as { $source?: string }
          return obj.$source === sourceRef
        })
      }
      
      // This is the critical fix - use the exact same pattern as original
      const unsubscribe = bus.onValue((streamData: unknown) => {
        // Extract value exactly like the original: bus.map(".value")
        let value: unknown
        if (streamData && typeof streamData === 'object' && 'value' in (streamData as object)) {
          value = (streamData as { value: unknown }).value
        } else {
          value = streamData
        }
        
        app.debug(`${skKey}: received value ${JSON.stringify(value)}`)
        
        // Update the last value for this key
        lastValues[skKey] = {
          timestamp: Date.now(),
          value
        }
        
        // Push current values array (like original Bacon.Bus.push)
        const now = Date.now()
        const currentValues = keys.map((key, i) => {
          const timeout = timeouts[i]
          return (!isDefined(timeout) || (lastValues[key]?.timestamp || 0) + (timeout || 0) > now)
            ? lastValues[key]?.value
            : null
        })
        
        app.debug(`Pushing combined values: ${JSON.stringify(currentValues)}`)
        combinedBus.next(currentValues)
      })
      
      if (unsubscribe) {
        unsubscribes.push(unsubscribe)
      }
    })
    
    // Debounce and process like the original
    const subscription = combinedBus.pipe(
      debounceTime(10)
    ).subscribe((values) => {
      try {
        app.debug(`*** CALLBACK TRIGGERED for ${conversion.title} with values: ${JSON.stringify(values)}`)
        if (conversion.callback) {
          const result = conversion.callback(...values)
          app.debug(`*** CALLBACK RESULT for ${conversion.title}: ${JSON.stringify(result)}`)
          processOutput(conversion, pluginOptions, result)
        }
      } catch (err) {
        app.error(err instanceof Error ? err : new Error(String(err)))
        console.error('Error in callback:', err)
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
  function startPlugin(options: PluginOptions): void {
    try {
      app.debug(`=== SK-N2K-EMITTER STARTING ===`)
      app.debug(`Plugin options received: ${JSON.stringify(Object.keys(options))}`)
      app.debug(`Using ${conversions.length} conversion modules`)
      
      // Count enabled conversions
      let enabledCount = 0
      for (const key of Object.keys(options)) {
        if (options[key]?.enabled) {
          enabledCount++
          app.debug(`${key} is ENABLED in options`)
        }
      }
      app.debug(`Total enabled conversions in options: ${enabledCount}`)

      // Start enabled conversions
      for (const conversion of conversions) {
        const conversionArray = Array.isArray(conversion) ? conversion : [conversion]
        
        for (const conv of conversionArray) {
          const convOptions = options[conv.optionKey]
          app.debug(`Checking conversion ${conv.title} (${conv.optionKey}) - enabled: ${convOptions?.enabled}`)
          
          if (!convOptions?.enabled) {
            continue
          }

          app.debug(`*** SETTING UP ENABLED CONVERSION: ${conv.title} ***`)

          let subConversions = conv.conversions
          if (isUndefined(subConversions)) {
            subConversions = [conv]
          } else if (isFunction(subConversions)) {
            subConversions = subConversions(convOptions)
          }

          if (!subConversions) {
            app.debug(`No subconversions for ${conv.title}`)
            continue
          }

          app.debug(`Setting up ${subConversions.length} subconversions for ${conv.title}`)

          for (const subConversion of subConversions) {
            if (isUndefined(subConversion)) continue

            const sourceType = subConversion.sourceType || 'onValueChange'
            const mapper = sourceTypes[sourceType]

            app.debug(`Setting up subconversion with sourceType: ${sourceType}`)

            if (!mapper) {
              console.error(`Unknown conversion type: ${sourceType}`)
              continue
            }

            // Set default output type
            if (isUndefined(subConversion.outputType)) {
              subConversion.outputType = 'to-n2k'
            }

            app.debug(`Calling mapper for ${subConversion.title || 'unnamed subconversion'}`)
            mapper(subConversion, convOptions)
            app.debug(`Mapper completed for ${subConversion.title || 'unnamed subconversion'}`)
          }
        }
      }
      
      app.debug(`=== SK-N2K-EMITTER STARTUP COMPLETE ===`)
    } catch (error) {
      app.error(`Failed to start plugin: ${error instanceof Error ? error.message : String(error)}`)
      console.error('Full startup error:', error)
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
