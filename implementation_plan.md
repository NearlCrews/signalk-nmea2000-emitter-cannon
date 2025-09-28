# Implementation Plan

Convert sk-n2k-emitter from JavaScript to modern TypeScript with updated project structure, latest dependencies, and modern tooling.

This implementation involves migrating a Signal K server plugin that converts Signal K data to NMEA 2000 format using CanboatJS. The plugin currently has ~45 conversion modules handling different PGN message types for marine electronics. The conversion will modernize the entire codebase to use TypeScript 5.9.2, implement modern project structure, update all dependencies to latest versions, and replace the testing framework with Vitest for better TypeScript integration.

[Types]
Define comprehensive type system for Signal K plugin architecture and NMEA 2000 message formats.

```typescript
// Core plugin interfaces
interface SignalKApp {
  getSelfPath(path: string): any;
  getPath(path: string): any;
  debug: (msg: string) => void;
  error: (error: Error | string) => void;
  emit: (event: string, data: any) => void;
  streambundle: any;
  subscriptionmanager: {
    subscribe(subscription: Subscription, unsubscribes: Array<() => void>, errorCallback: (err: Error) => void, callback: (delta: any) => void): void;
  };
  signalk: {
    on(event: string, callback: (data: any) => void): void;
  };
  reportOutputMessages?: (count: number) => void;
}

interface SignalKPlugin {
  id: string;
  name: string;
  description: string;
  schema: () => JSONSchema;
  start: (options: PluginOptions) => void;
  stop: () => void;
}

// NMEA 2000 message types
interface N2KMessage {
  prio: number;
  pgn: number;
  dst: number;
  fields: Record<string, any>;
}

// Conversion module interfaces
interface ConversionModule {
  title: string;
  optionKey: string;
  keys?: string[];
  context?: string;
  sourceType?: 'onDelta' | 'onValueChange' | 'subscription' | 'timer';
  outputType?: 'to-n2k';
  timeouts?: number[];
  interval?: number;
  callback: (...values: any[]) => N2KMessage[] | Promise<N2KMessage[]>;
  conversions?: ConversionModule[] | ((options: any) => ConversionModule[]);
  properties?: JSONSchema['properties'] | (() => JSONSchema['properties']);
  tests?: ConversionTest[];
  testOptions?: any;
}

interface ConversionTest {
  input: any[];
  expected: N2KMessage[];
  skData?: Record<string, any>;
  skSelfData?: Record<string, any>;
}

interface PluginOptions {
  [key: string]: {
    enabled: boolean;
    resend?: number;
    resendTime?: number;
    [optionKey: string]: any;
  };
}

interface Subscription {
  context: string;
  subscribe: Array<{ path: string }>;
}
```

[Files]
Restructure project to modern TypeScript architecture with proper separation of concerns.

**New files to create:**
- `src/index.ts` - Main plugin entry point
- `src/types/` - Type definitions directory
- `src/types/signalk.ts` - Signal K related types
- `src/types/nmea2000.ts` - NMEA 2000 message types
- `src/types/plugin.ts` - Plugin-specific types
- `src/conversions/` - TypeScript conversion modules directory
- `src/utils/` - Utility functions
- `src/utils/pathUtils.ts` - Path manipulation utilities
- `src/utils/messageUtils.ts` - Message processing utilities
- `dist/` - Compiled JavaScript output
- `tsconfig.json` - TypeScript configuration
- `vitest.config.ts` - Vitest configuration
- `pnpm-lock.yaml` - pnpm lock file
- `.gitignore` - Updated gitignore for TypeScript project

**Existing files to modify:**
- `package.json` - Update to TypeScript project structure, latest dependencies, build scripts
- `README.md` - Update documentation for TypeScript usage
- `biome.json` - Update for TypeScript linting rules
- `.clinerules/` files - Update for TypeScript patterns

**Files to migrate:**
- `index.js` → `src/index.ts`
- All files in `conversions/*.js` → `src/conversions/*.ts`
- `test/test.js` → `src/test/index.test.ts`
- `test/battery_status_127508.js` → `src/test/battery.test.ts`

**Files to remove:**
- `package-lock.json` (replaced by pnpm-lock.yaml)

[Functions]
Modernize all function implementations with proper TypeScript typing and error handling.

**New functions:**
- `createConversionModule<T>(config: ConversionModuleConfig<T>): ConversionModule` - Type-safe conversion module factory
- `validateN2KMessage(message: unknown): N2KMessage` - Runtime message validation
- `createPluginSchema(conversions: ConversionModule[]): JSONSchema` - Dynamic schema generation
- `pathToPropName(path: string): string` - Enhanced path utilities with proper typing
- `timeoutingArrayStream<T>(keys: string[], timeouts: number[], streambundle: any, unsubscribes: Array<() => void>, options: any): any` - Properly typed stream handling

**Modified functions:**
- `load_conversions(app: SignalKApp, plugin: any): ConversionModule[]` - Add proper typing and error handling
- `processToN2K(values: N2KMessage[] | null): Promise<void>` - Async processing with proper error handling
- `mapOnDelta(conversion: ConversionModule, options: any): void` - Enhanced delta processing
- `mapBaconjs(conversion: ConversionModule, options: any): void` - Typed BaconJS integration
- `mapSubscription(mapping: ConversionModule, options: any): void` - Subscription management with types
- `mapTimer(conversion: ConversionModule, options: any): void` - Timer-based processing

**Enhanced conversion callbacks:**
All conversion module callbacks will be updated with:
- Proper parameter typing
- Return type enforcement
- Input validation
- Error boundary handling
- Async support where needed

[Classes]
No traditional classes needed - using modern functional TypeScript approach with interfaces and factory functions.

**Type-safe factories:**
- `PluginFactory` - Creates the main plugin instance
- `ConversionModuleFactory` - Creates conversion modules with validation
- `TestSuiteFactory` - Creates type-safe test suites

[Dependencies]
Update to latest versions with TypeScript support and modern alternatives.

**New dependencies:**
- `typescript@5.9.2` - Latest TypeScript compiler
- `vitest@3.2.4` - Modern testing framework with TypeScript support
- `@types/node@^22.0.0` - Node.js type definitions
- `esbuild@^0.24.0` - Fast TypeScript/JavaScript bundler
- `tsx@^4.19.0` - TypeScript execution engine
- `pnpm@^9.0.0` - Fast, disk space efficient package manager
- `rxjs@^7.8.2` - Modern reactive programming library (replaces BaconJS)
- `es-toolkit@^1.0.0` - Modern utility library (replaces Lodash)

**Updated dependencies:**
- `@canboat/canboatjs@^3.11.0` - Already TypeScript, keep current
- `path-scurry@^2.0.0` - Already latest

**Replaced dependencies:**
- Remove `baconjs@^3.0.23` → Use `rxjs@^7.8.2` (better TypeScript support, more comprehensive)
- Remove `lodash@^4.17.21` → Use `es-toolkit@^1.0.0` (2-3x faster, 97% smaller, TypeScript-first)
- Remove `mocha@^11.7.2` → Use `vitest@3.2.4`
- Remove `chai@^5.1.2` → Use Vitest assertions
- Remove `chai-json-equal@^0.0.1` → Use Vitest custom matchers
- Remove `sinon@^21.0.0` → Use Vitest mocking

**Dev dependencies to add:**
- `@vitest/ui@^3.2.4` - Vitest UI for test debugging

[Testing]
Migrate to Vitest with comprehensive TypeScript test coverage.

**Test structure:**
- `src/test/index.test.ts` - Main conversion tests
- `src/test/battery.test.ts` - Battery-specific tests
- `src/test/utils.test.ts` - Utility function tests
- `src/test/types.test.ts` - Type validation tests

**Testing approach:**
- Use Vitest's built-in TypeScript support
- Implement type-safe test helpers
- Add runtime type validation tests
- Create custom matchers for NMEA 2000 message validation
- Maintain all existing test cases while adding TypeScript type checking
- Add integration tests for the complete conversion pipeline

**Test configuration:**
```typescript
// vitest.config.ts
export default {
  test: {
    globals: true,
    environment: 'node',
    typecheck: {
      tsconfig: './tsconfig.json'
    }
  }
}
```

[Implementation Order]
Sequential steps to ensure smooth migration without breaking existing functionality.

1. **Project Setup & Configuration**
   - Install pnpm and initialize new package structure
   - Create TypeScript configuration files
   - Set up modern build pipeline with esbuild
   - Update package.json with new scripts and dependencies

2. **Type System Foundation**
   - Create comprehensive type definitions in `src/types/`
   - Define interfaces for Signal K app, plugin, and conversion modules
   - Create NMEA 2000 message type definitions
   - Set up utility type helpers

3. **Core Plugin Migration**
   - Convert `index.js` to `src/index.ts`
   - Implement type-safe plugin factory
   - Add proper error handling and validation
   - Update configuration schema generation

4. **Conversion Module Migration**
   - Convert all conversion modules from JS to TS one by one
   - Start with simpler modules (wind, depth) then complex ones (battery, engine)
   - Ensure each module has proper typing and validation
   - Maintain all existing functionality while adding type safety

5. **Testing Framework Migration**
   - Set up Vitest configuration
   - Convert existing Mocha/Chai tests to Vitest
   - Add type-checking to test suite
   - Create custom NMEA 2000 message matchers
   - Ensure 100% test coverage maintained

6. **Build System & Documentation**
   - Configure esbuild for production builds
   - Update documentation for TypeScript usage
   - Create development workflow documentation
   - Set up continuous integration for TypeScript compilation

7. **Final Integration & Testing**
   - Comprehensive end-to-end testing
   - Performance benchmarking vs original JavaScript version
   - Signal K server integration testing
   - Final cleanup and optimization
