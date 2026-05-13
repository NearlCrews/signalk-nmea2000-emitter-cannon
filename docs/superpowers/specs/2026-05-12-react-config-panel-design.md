# React Config Panel for signalk-nmea2000-emitter-cannon

**Status:** Approved through Section 6 of brainstorming, pending user review of this written spec before writing-plans.

**Date:** 2026-05-12

**Target release:** v1.5.1

## 1. Problem

The plugin ships 45 conversion modules emitting 52 PGNs. Configuration lives in `src/schema.ts` as ~550 lines of hand-rolled JSON Schema, rendered by the Signal K admin UI's stock react-jsonschema-form (rjsf). The result:

- 45 sibling accordions in a flat list. Hard to scan, impossible to filter or group.
- No live status (NMEA 2000 ready, currently emitting, message rate, recent errors).
- Source fields are opaque free text. Users must alt-tab to the Signal K Data Browser to find a `$source` prefix.
- Per-conversion mapping arrays (battery, engine, tank, solar, brightness, exhaust) render through rjsf's array-of-object widget, which provides no Signal K context.
- No preset bundles. Enabling "basic navigation" means clicking 8 conversions individually.
- Schema and TypeScript types are separate artifacts that drift.

## 2. Approach

Adopt the federated React panel pattern that `signalk-questdb`, `signalk-container`, `@signalk/app-dock`, and 10+ other plugins already use. Ship a webpack-built React app under `public/` whose `remoteEntry.js` the Signal K admin UI loads via Module Federation. The federated panel becomes the only configuration UI (the rjsf form is suppressed when the `signalk-plugin-configurator` keyword is present). A small Express router on the plugin side exposes live status, available paths, and per-path source enumeration for the panel to consume.

Single source of truth for the config shape: TypeBox. `Type.Object({...})` returns a valid JSON Schema literal at runtime, so `Plugin.schema` returns the TypeBox value directly (useful as a structural spec for downstream tools even though the admin UI ignores it once federation is active).

## 3. Decisions locked in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| v1 scope | Full replacement of `src/schema.ts` | User chose this over "panel + minimal schema fallback" and "status dashboard only". |
| Discovery model | Live discovery via plugin HTTP API | Dropdowns populated from `app.streambundle.getAvailablePaths()` and `/sources`. Falls back to free text when no live data. |
| Schema source | TypeBox (`@sinclair/typebox`) | One definition produces both TypeScript types (via `Static<>`) and JSON Schema. Matches signalk-questdb. |
| Build pipeline | Webpack 5 alongside esbuild | esbuild keeps building the plugin; webpack 5 builds the panel only. Mirrors signalk-questdb. |
| Categorization | Metadata on each `ConversionModule` (`category`, `presets`) | Co-located with the rest of the module identity. Cannot forget to categorize a new conversion. |
| v1 feature set | Status dashboard + categorized layout + live source dropdowns + mapping editors + preset bundles | Selected by user. Live emission preview deferred to v1.x. |

## 4. File layout

```
src/
  config/
    schema.ts            // TypeBox: RootConfig, Conversion. Derived type Config = Static<typeof RootConfig>.
  panel/
    index.tsx            // Federation entry; re-exports PluginConfigurationPanel.
    PluginConfigurationPanel.tsx
    components/          // StatusDashboard, PresetChips, GlobalSettings, CategoryTabs, ConversionCard,
                         // ResendField, SourceField, ExtrasEditor + per-family editors.
    hooks/               // useConfig (reducer), useStatus (3s poll, paused on hidden tab), useDiscovery,
                         // useSources (per-path cache).
    styles.ts            // Inline-style objects. No CSS pipeline.
  api/
    router.ts            // Express router factory consumed by registerWithRouter.
    discovery.ts         // enumerateActivePaths, enumerateSourcesForPath (via getSelfPath lookup).
public/                  // Webpack federation output; shipped in npm tarball via "files".
  remoteEntry.js
  PluginConfigurationPanel.js
  (chunked dependency files)
webpack.config.cjs
tsconfig.panel.json
docs/superpowers/specs/2026-05-12-react-config-panel-design.md  // this file
```

As built: the presets list is inline in `src/config/schema.ts` (`PresetTags`), so there is no separate presets module. The status snapshot builder is a `getStatusSnapshot()` method on `PluginManager` rather than a standalone status module under `src/api/`.

Existing files that change:

- `src/conversions/*.ts` (45 files): each module gains `category: ConversionCategory` (required) and optional `presets: PresetTag[]`. Existing fields untouched.
- `src/types/plugin.ts`: `ConversionModule<T>` and `SubConversionModule<T>` gain the same two fields.
- `src/index.ts`: gains `registerWithRouter(router)` returning `createApiRouter(app, pluginManager)`. The `schema` lifecycle property becomes `() => RootConfig`.
- `src/plugin-manager.ts`: gains `getStatusSnapshot()`, `getConversionMetadata()`, and a two-Map emit counter (`emitCounts`, `lastEmitAt`) updated inside the existing `processOutput()` path. Migration helper `migrateLegacyConfig(raw)` runs at the top of `start()`.
- `src/schema.ts`: **deleted**.
- `package.json`: adds `signalk-plugin-configurator` keyword, `public/` to `files`, `@sinclair/typebox` to dependencies, webpack/babel/react devDeps, build:plugin / build:panel scripts.

## 5. Data model

TypeBox schema in `src/config/schema.ts`:

```typescript
import { Type, Static } from "@sinclair/typebox";

export const Categories = [
  "navigation", "engine", "electrical", "tanks",
  "environment", "ais", "comms", "system",
] as const;
export type ConversionCategory = (typeof Categories)[number];

const ConversionCommon = Type.Object({
  enabled: Type.Boolean({ default: false }),
  resend: Type.Integer({ default: 0, minimum: 0 }),
  sources: Type.Optional(Type.Record(Type.String(), Type.String())),
});

export const Conversion = Type.Composite([
  ConversionCommon,
  Type.Object({ extras: Type.Optional(Type.Record(Type.String(), Type.Unknown())) }),
]);

export const RootConfig = Type.Object({
  globalResendInterval: Type.Integer({ default: 30, minimum: 0 }),
  conversions: Type.Record(Type.String(), Conversion, { default: {} }),
});

export type Config = Static<typeof RootConfig>;
```

**Shape change versus today:** every conversion's data nests under `conversions.<KEY>` with strict separation of `enabled` / `resend` / `sources` / `extras`. `extras` is `Record<string, unknown>` (the conversion modules already validate their own extras shape; we keep that ownership boundary).

**Migration (load-time, idempotent):**

```typescript
function migrateLegacyConfig(raw: any): Config {
  if (raw?.conversions) return raw;  // already new shape
  const conversions: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (key === "globalResendInterval") continue;
    if (!value || typeof value !== "object") continue;
    const { enabled, resend, ...rest } = value as any;
    const sources: Record<string, string> = {};
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (typeof v === "string") sources[k] = v;
      else extras[k] = v;
    }
    conversions[key] = { enabled, resend, sources, extras };
  }
  return { globalResendInterval: raw?.globalResendInterval ?? 30, conversions };
}
```

The migrated object is written back only on the next user-driven save through the panel. A user who downgrades to v1.4.4 after seeing v1.5.1 still has their original `plugin-config.json` intact.

## 6. Plugin runtime additions

### Express router

Mounted at `/plugins/signalk-nmea2000-emitter-cannon/` via `Plugin.registerWithRouter`.

```typescript
export function createApiRouter(
  app: SignalKApp,
  pluginManager: PluginManager,
): (router: Router) => void {
  return (router) => {
    app.securityStrategy.addAdminMiddleware(
      "/plugins/signalk-nmea2000-emitter-cannon/api"
    );
    router.get("/api/status",      (_req, res) => res.json(pluginManager.getStatusSnapshot()));
    router.get("/api/conversions", (_req, res) => res.json({ conversions: pluginManager.getConversionMetadata() }));
    router.get("/api/paths",       (_req, res) => res.json({ paths: enumerateActivePaths(app) }));
    router.get("/api/sources",     (req, res) => {
      const path = String(req.query.path ?? "");
      if (!path) { res.status(400).json({ error: "path required" }); return; }
      res.json({ sources: enumerateSourcesForPath(app, path) });
    });
  };
}
```

**Auth.** All four endpoints are admin-gated via `addAdminMiddleware`. Research confirmed plugin routers receive no auth middleware by default; without this call the endpoints would be reachable by anyone with network access to the admin port. The panel runs in the admin's authenticated session, so the gate is transparent to legitimate use.

Open question for implementation: middleware ordering. `addAdminMiddleware(prefix)` registers middleware on the parent Express app, not on the plugin router. We need to confirm during step 2 that calling it from inside `registerWithRouter` runs before the route handlers fire. If signalk-server mounts the router synchronously after `registerWithRouter` returns, the call ordering is fine. If not, the call may need to move to `start()` instead. Verify with a curl test that an unauthenticated request to `/plugins/signalk-nmea2000-emitter-cannon/api/status` returns 401.

### Source discovery

`app.getPath("vessels.self.<path>")` does NOT resolve the `self` indirection, so the correct call is `app.getSelfPath(path)`. The per-path node carries a `values` map keyed by `$source` ID:

```typescript
export function enumerateSourcesForPath(app: SignalKApp, path: string): string[] {
  const node = app.getSelfPath?.(path);
  const values = (node && typeof node === "object" ? (node as { values?: unknown }).values : undefined);
  if (!values || typeof values !== "object") return [];
  return Object.keys(values as Record<string, unknown>).sort();
}
```

Cached at the panel for the component lifetime; the panel never polls this endpoint, it fetches on demand when a source field gains focus.

### Status snapshot

```typescript
export interface StatusSnapshot {
  nmea2000Ready: boolean;
  enabledCount: number;
  totalConversions: number;
  perConversion: Array<{
    key: string;
    title: string;
    enabled: boolean;
    lastEmitMs?: number;        // age in ms of the last emit
    emitCount: number;
    lastErrorMessage?: string;  // last throttled error
    lastErrorAgeMs?: number;
  }>;
  startTime: number;
}
```

`PluginManager` gains two `Map`s (`emitCounts`, `lastEmitAt`) updated inside the existing `processOutput()` path. One `Map.set` per emit; zero allocations beyond that.

## 7. Panel UI

```
PluginConfigurationPanel ({ configuration, save })
├── StatusDashboard         // ready dot, enabled X/Y, msg rate, error badge; 3s poll, paused when tab hidden
├── PresetChips             // [Basic Nav] [Engine Set] [Full AIS] [Environmental] ...
├── GlobalSettings          // globalResendInterval
├── CategoryTabs            // Navigation | Engine | Electrical | Tanks | Environment | AIS | Comms | System
│   └── ConversionCard × N
│       ├── header           (title + PGN list + enabled toggle + emit count + error dot)
│       ├── ResendField
│       ├── SourceField × M  (dropdown from /api/sources, free-text fallback when empty)
│       └── ExtrasEditor     (chosen via ExtrasMeta discriminator from /api/conversions)
└── FooterBar               // dirty indicator, Save (manual), Discard
```

State: single `useReducer` at the panel root with actions for `setEnabled`, `setResend`, `setSource`, `setExtras`, `setGlobalResend`, `applyPreset`, `discard`. `save(state.config)` is called only on the user's explicit Save click. `save` is fire-and-forget; the next prop update reflects the persisted state.

`ExtrasMeta` is a discriminated union shipped in the `/api/conversions` response describing which editor to render: `{ type: "none" }`, `{ type: "batteryMapping" | "engineMapping" | "tankMapping" | "solarMapping" | "brightnessMapping" | "exhaustMapping", minRows: 0 }`, or `{ type: "field", key, label, control: "text" | "number" | "boolean", default? }`. The panel selects the editor by `type`; the editor reads and writes through `setExtras`, so the panel orchestration stays shape-agnostic.

Presets are additive: clicking a chip flips enable on every conversion tagged with that preset and touches nothing else. Discard is the explicit undo.

Styling: inline `style={}` objects. No CSS pipeline. The admin UI provides the surrounding chrome; we render into a neutral light palette with no theme assumptions. Dark mode deferred to v1.x.

## 8. Build pipeline

`webpack.config.cjs` (CommonJS: `package.json` has `"type": "module"`, so the config file uses the `.cjs` extension to opt out):

```javascript
const path = require("node:path");
const webpack = require("webpack");
const pkg = require("./package.json");

const safeName = pkg.name.replace(/[-@/]/g, "_");

module.exports = {
  entry: "./src/panel/index.tsx",
  mode: "production",
  experiments: { outputModule: true },
  output: {
    path: path.resolve(__dirname, "public"),
    filename: "[name].mjs",
    chunkFilename: "[name].mjs",
    module: true,
    library: { type: "module" },
    clean: false,
  },
  module: {
    rules: [{
      test: /\.tsx?$/,
      loader: "babel-loader",
      exclude: /node_modules/,
      options: {
        presets: [
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
          ["@babel/preset-react", { runtime: "automatic" }],
        ],
      },
    }],
  },
  resolve: { extensions: [".tsx", ".ts", ".jsx", ".js"] },
  plugins: [
    new webpack.container.ModuleFederationPlugin({
      name: safeName,
      library: { type: "module" },
      filename: "remoteEntry.js",
      exposes: { "./PluginConfigurationPanel": "./src/panel/PluginConfigurationPanel" },
      shared: {
        react: { singleton: true, requiredVersion: "^19" },
        "react-dom": { singleton: true, requiredVersion: "^19" },
      },
    }),
  ],
};
```

The ESM federation variant (`experiments.outputModule: true`, `output.module: true`, `library: { type: "module" }`, `.mjs` chunk filenames) is required because the package's `"type": "module"` setting causes the admin UI to inject `remoteEntry.js` as `<script type="module">`. The original `library: { type: "var" }` script-tag variant was attempted first and rejected by the admin runtime; this finding came out of the milestone 3 live smoke and the spec has been updated to match.

`tsconfig.panel.json` extends the root with `jsx: react-jsx`, DOM libs, and `include: ["src/panel/**/*", "src/config/**/*"]`. `npm run typecheck` runs both root and panel tsconfigs.

`package.json` scripts:

```json
{
  "build":        "npm run clean && npm run build:plugin && npm run build:panel",
  "build:plugin": "esbuild src/index.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/index.js --external:rxjs",
  "build:panel":  "webpack --config webpack.config.cjs",
  "build:watch":  "npm run clean && npm run build:plugin -- --sourcemap=linked --watch & webpack --config webpack.config.cjs --watch",
  "clean":        "rm -rf dist public/*.js public/*.LICENSE.txt"
}
```

devDeps added: `@babel/core`, `@babel/preset-react`, `@babel/preset-typescript`, `babel-loader`, `webpack`, `webpack-cli`, `react`, `react-dom`, `@types/react`, `@types/react-dom`. Runtime dep added: `@sinclair/typebox`.

`react`/`react-dom` are dev-only because they are host-provided singletons at runtime. TypeBox lives in `dist/index.js` (used by `schema()` and by config migration).

## 9. Federation contract correctness

Verified against `@signalk/server-admin-ui@2.27.0` source and confirmed across 13 in-the-wild plugins:

- Remote name: `pkg.name.replace(/[-@/]/g, "_")`, library type `"var"`. Admin reads `window[<safeName>]` after the script tag executes.
- Script URL: server injects `<script src="/${packageName}/remoteEntry.js">`. Webpack's automatic publicPath (via `document.currentScript.src`) resolves chunk URLs correctly. No `output.publicPath` needed.
- Shared singletons: `react` and `react-dom` at `^19` (admin runs React 19 in 2.27.0+).
- Exposed module: `./PluginConfigurationPanel`, default export.
- Component props: `{ configuration: unknown, save: (configuration: unknown) => void }`. `save` is fire-and-forget; do not await.
- Error handling: admin wraps the component in an Error Boundary + Suspense. We do not add our own. If the remote fails to load or the component throws, the admin shows "Plugin Configuration Unavailable".
- Fallback: when `signalk-plugin-configurator` is in keywords, the admin UI does not render the rjsf form. `schema()` is kept for non-admin tools that may still consume it.
- Min admin UI: `2.27.0`. README will document this.

## 10. Testing

| Layer | Scope |
|---|---|
| Unit (Vitest) | `src/config/schema.ts` round-trip + JSON Schema validity; `migrateLegacyConfig` fixtures (one per family with extras); `src/api/discovery.ts` and `PluginManager.getStatusSnapshot()` with mocked SignalKApp; existing conversion tests stay green (metadata additions are passive). |
| Integration (Vitest, new `src/test/api.test.ts`) | In-process Express + supertest. Hit each endpoint, assert response matches the TypeBox interface. No real signalk-server. |
| Live smoke (manual) | Per the project feedback memory, the developer can restart the local signalk-server and the user provides feedback in the admin UI. Performed after each implementation milestone. |

The React panel itself receives **no automated tests in v1**. Component tests on inline-styled federation panels are high cost / low value here. If a regression surfaces, Playwright can land in v1.x.

## 11. Rollout

- **Version:** v1.5.1.
- **Breaking changes:** Config shape (read-compatible via migration; write-shape changed). Admin UI now loads a federated panel and ignores the rjsf form. Minimum admin UI bumped to 2.27.0 (documented in README).
- **Push policy:** Commits land locally only. No push, no `npm publish`, no `npm run release` until the user explicitly says go (see `CLAUDE.md` workflow rules and the corresponding feedback memory).

## 12. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Future admin UI deprecates federation API | low | Mirror questdb's federation shape exactly; pattern is in production across 13+ plugins. |
| Webpack + esbuild build configs drift | medium | Single `npm run build` orchestrates both; one CI lane runs the full chain. |
| Discovery endpoints leak | low | All four `/api/*` endpoints gated by `addAdminMiddleware`. Smoke-test during live phase. |
| Migration leaves legacy top-level keys orphaned | medium | Migration unit test asserts migrated output contains no legacy top-level keys; user-driven save rewrites the file. |
| TypeBox added 30 KB to plugin bundle | accepted | esbuild minifies to roughly +18 KB gzipped; acceptable for a server plugin. |
| React 19 hooks break under singleton:true if admin UI ships older React | low | Federation share scope warns and falls back; admin UI 2.27.0+ guarantees React 19. README pins the requirement. |

## 13. Implementation milestones

Detail belongs in the writing-plans output, but the order is:

1. TypeBox schema + migration helper + tests. Plugin still loads: existing installs are migrated at start, fresh installs see an empty `conversions` map. CI green. No UI work yet, no federation, no public/.
2. API router + discovery + status snapshot + admin auth middleware + integration tests. Curl-testable.
3. Webpack federation skeleton: minimal panel rendering "hello, conversions: N" from `/api/conversions`. Live smoke: restart signalk, panel renders inside the admin UI.
4. Status dashboard.
5. ConversionCard with enabled / resend / source dropdown (no extras).
6. ExtrasEditor variants, one PR per family: battery, engine, tank, solar, brightness, exhaust, notifications.excludePaths, temperature.instance.
7. Preset chips.
8. Documentation rewrite (README, CHANGELOG), v1.5.1 release candidate. Local commit only, no push.

## 14. Out of scope for v1

- Per-conversion live emission preview (ring buffer per conversion, JSON view).
- Dark mode / theme adaptation.
- Component tests for the React panel.
- User-defined custom presets (v1 ships a fixed list inline in `src/config/schema.ts`).
- Reverse "from PGN to Signal K paths" wizard.
- AIS per-vessel filter sub-config (v1 AIS family has enabled + resend only).
