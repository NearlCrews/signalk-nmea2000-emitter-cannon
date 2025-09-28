/**
 * NMEA 2000 message structure as required by CanboatJS
 * All NMEA 2000 messages must follow this exact format
 */
export interface N2KMessage {
  /** Priority (0-7, typically 2 for data messages, 6 for control) */
  prio: number
  /** Parameter Group Number - identifies the message type */
  pgn: number
  /** Destination address (255 for broadcast) */
  dst: number
  /** Source address (optional, set by canboat) */
  src?: number
  /** Message fields containing the actual data */
  fields: Record<string, N2KFieldValue>
}

/**
 * NMEA 2000 message with timing information
 */
export interface TimedN2KMessage extends N2KMessage {
  /** Timestamp when the message was created */
  timestamp?: string
  /** Message sequence ID */
  id?: string
}

/**
 * NMEA 2000 field value types
 */
export type N2KFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | N2KFieldValue[]
  | Record<string, unknown>

/**
 * Common NMEA 2000 field names and their expected types
 */
export interface CommonN2KFields {
  /** Engine or device instance ID */
  instance?: number
  /** Sequence Identifier */
  SID?: number
  /** Temperature in Kelvin */
  temperature?: number
  /** Voltage in Volts */
  voltage?: number
  /** Current in Amperes */
  current?: number
  /** Pressure in Pascals */
  pressure?: number
  /** Speed in m/s */
  speed?: number
  /** Angle in radians */
  angle?: number
  /** Time in seconds */
  time?: number
  /** Percentage (0-100) */
  percentage?: number
}

/**
 * Battery status fields (PGN 127506, 127508)
 */
export interface BatteryFields extends CommonN2KFields {
  /** DC source type */
  dcType?: 'Battery' | 'Alternator' | 'Converter' | 'Solar Cell' | 'Wind Generator'
  /** State of charge percentage */
  stateOfCharge?: number
  /** State of health percentage */
  stateOfHealth?: number
  /** Time remaining in seconds */
  timeRemaining?: number
  /** Ripple voltage */
  rippleVoltage?: number
}

/**
 * Engine parameter fields (PGN 127488, 127489)
 */
export interface EngineFields extends CommonN2KFields {
  /** Engine instance identifier */
  engineInstance?: number
  /** Oil pressure in Pascals */
  oilPressure?: number
  /** Oil temperature in Kelvin */
  oilTemperature?: number
  /** Coolant temperature in Kelvin */
  coolantTemperature?: number
  /** Alternator potential in Volts */
  alternatorPotential?: number
  /** Fuel rate in m³/s */
  fuelRate?: number
  /** Total engine hours */
  totalEngineHours?: number
  /** Engine load percentage */
  engineLoad?: number
  /** Engine torque percentage */
  engineTorque?: number
  /** Boost pressure in Pascals */
  boostPressure?: number
  /** Trim/tilt percentage */
  tiltTrim?: number
}

/**
 * Wind data fields (PGN 130306)
 */
export interface WindFields extends CommonN2KFields {
  /** Wind speed in m/s */
  windSpeed?: number
  /** Wind angle in radians */
  windAngle?: number
  /** Wind reference (Apparent, True, etc.) */
  reference?: 'True' | 'Apparent' | 'True (boat referenced)' | 'True (water referenced)'
}

/**
 * Depth fields (PGN 128267)
 */
export interface DepthFields extends CommonN2KFields {
  /** Depth below transducer in meters */
  depth?: number
  /** Offset from transducer to surface/keel in meters */
  offset?: number
}

/**
 * GPS fields (PGN 129025, 129026, 129029)
 */
export interface GPSFields extends CommonN2KFields {
  /** Latitude in radians */
  latitude?: number
  /** Longitude in radians */
  longitude?: number
  /** Altitude in meters */
  altitude?: number
  /** Course over ground in radians */
  cog?: number
  /** Speed over ground in m/s */
  sog?: number
  /** GPS quality indicator */
  gnssType?: string
  /** Method of positioning */
  method?: string
  /** Number of satellites */
  nSatellites?: number
  /** Horizontal dilution of precision */
  hdop?: number
  /** Position dilution of precision */
  pdop?: number
  /** Geoidal separation in meters */
  geoidalSeparation?: number
}

/**
 * Validation function type for N2K messages
 */
export type N2KMessageValidator = (message: unknown) => N2KMessage

/**
 * Error types for N2K message validation
 */
export class N2KValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message)
    this.name = 'N2KValidationError'
  }
}
