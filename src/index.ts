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
        description: '<i>PGNs: 130306</i>',
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
        description: '<i>PGNs: 128267</i>',
        properties: {
          enabled: { title: 'Enabled', type: 'boolean', default: false },
          resend: { type: 'number', title: 'Resend (seconds)', description: 'If non-zero, the msg will be periodically resent', default: 0 },
          resendTime: { type: 'number', title: 'Resend Duration (seconds)', description: 'The value will be resent for the given number of seconds', default: 30 }
        }
      },
      COG_SOG: {
        type: 'object', 
        title: 'COG & SOG',
        description: '<i>PGNs: 129026</i>',
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
        description: '<i>PGNs: 127250</i>',
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
        description: '<i>PGNs: 127506, 127508</i>',
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
