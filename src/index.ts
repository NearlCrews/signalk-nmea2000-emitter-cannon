import type {
  SignalKApp,
  SignalKPlugin,
  PluginOptions,
} from './types/index.js'

import { schema } from './schema.js'
import { PluginManager } from './plugin-manager.js'

/**
 * Signal K to NMEA 2000 conversion plugin factory
 * 
 * @param app - Signal K application instance
 * @returns Plugin instance
 */
export default function createPlugin(app: SignalKApp): SignalKPlugin {
  let pluginManager: PluginManager | null = null

  const plugin: SignalKPlugin = {
    id: 'sk-n2k-emitter',
    name: 'SignalK to N2K Emitter',
    description: 'Plugin to convert Signal K to NMEA2000 with enhanced Garmin compatibility (92% PGN coverage)',
    schema: () => schema,
    start: startPlugin,
    stop: stopPlugin
  }

  /**
   * Start the plugin
   */
  function startPlugin(options: PluginOptions): void {
    try {
      // Create and initialize the plugin manager
      pluginManager = new PluginManager(app, plugin)
      
      // Start the plugin manager with the provided options
      pluginManager.start(options)
    } catch (error) {
      app.error(`Failed to start plugin: ${error instanceof Error ? error.message : String(error)}`)
      console.error('Full startup error:', error)
    }
  }

  /**
   * Stop the plugin
   */
  function stopPlugin(): void {
    if (pluginManager) {
      pluginManager.stop()
      pluginManager = null
    }
  }

  return plugin
}