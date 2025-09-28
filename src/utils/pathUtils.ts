/**
 * Utility functions for working with Signal K paths and property names
 */

/**
 * Convert a Signal K path to a property name for configuration
 * Removes dots to create a valid property name
 * 
 * @param path - Signal K path like 'propulsion.engine.temperature'
 * @returns Property name like 'propulsionenginetemperature'
 */
export function pathToPropName(path: string): string {
  return path.replace(/\./g, '')
}

/**
 * Check if a value is defined (not undefined)
 * 
 * @param value - Value to check
 * @returns true if value is not undefined
 */
export function isDefined<T>(value: T | undefined): value is T {
  return typeof value !== 'undefined'
}

/**
 * Check if a value is not defined (is undefined)
 * 
 * @param value - Value to check
 * @returns true if value is undefined
 */
export function isNotDefined(value: unknown): value is undefined {
  return typeof value === 'undefined'
}

/**
 * Safely get a nested property from an object using a path
 * 
 * @param obj - Object to get property from
 * @param path - Dot-separated path like 'a.b.c'
 * @returns The value at the path, or undefined if not found
 */
export function getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: unknown, key: string) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

/**
 * Safely set a nested property on an object using a path
 * 
 * @param obj - Object to set property on
 * @param path - Dot-separated path like 'a.b.c'
 * @param value - Value to set
 */
export function setNestedProperty(
  obj: Record<string, unknown>, 
  path: string, 
  value: unknown
): void {
  const keys = path.split('.')
  const lastKey = keys.pop()
  
  if (!lastKey) return
  
  const target = keys.reduce((current: Record<string, unknown>, key: string) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {}
    }
    return current[key] as Record<string, unknown>
  }, obj)
  
  target[lastKey] = value
}

/**
 * Create a deep copy of an object
 * 
 * @param obj - Object to copy
 * @returns Deep copy of the object
 */
export function deepCopy<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime()) as T
  if (Array.isArray(obj)) return obj.map(item => deepCopy(item)) as T
  
  const copy = {} as T
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      copy[key] = deepCopy(obj[key])
    }
  }
  return copy
}

/**
 * Validate that a string is a valid Signal K path
 * 
 * @param path - Path to validate
 * @returns true if path is valid
 */
export function isValidSignalKPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  
  // Basic validation - path should contain only letters, numbers, dots, underscores
  const pathRegex = /^[a-zA-Z][a-zA-Z0-9._]*$/
  return pathRegex.test(path)
}

/**
 * Extract the vessel context from a path
 * 
 * @param path - Full path like 'vessels.self.propulsion.engine.temperature'
 * @returns Context part like 'vessels.self' or undefined if not a vessel path
 */
export function extractVesselContext(path: string): string | undefined {
  const parts = path.split('.')
  if (parts.length >= 2 && parts[0] === 'vessels') {
    return `${parts[0]}.${parts[1]}`
  }
  return undefined
}

/**
 * Remove vessel context from a path to get the data path
 * 
 * @param path - Full path like 'vessels.self.propulsion.engine.temperature'
 * @returns Data path like 'propulsion.engine.temperature'
 */
export function removeVesselContext(path: string): string {
  const parts = path.split('.')
  if (parts.length >= 3 && parts[0] === 'vessels') {
    return parts.slice(2).join('.')
  }
  return path
}
