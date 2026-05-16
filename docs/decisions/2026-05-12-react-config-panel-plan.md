# React Config Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled JSON Schema admin UI for `signalk-nmea2000-emitter-cannon` with a federated React panel (webpack 5 Module Federation), TypeBox-derived config schema, and live discovery/status endpoints over an Express router. Target release: v1.5.3.

**Architecture:** Plugin stays on esbuild (no change to runtime bundle). A second build target (`webpack --config webpack.config.cjs`) produces `public/remoteEntry.js` consumed by `@signalk/server-admin-ui >= 2.27.0`. Backend gains an Express router under `/plugins/signalk-nmea2000-emitter-cannon/api/` for status, conversion metadata, path discovery, and `$source` enumeration. The config shape moves into TypeBox (`src/config/schema.ts`), with a load-time migration from the legacy flat shape so existing installs upgrade transparently.

**Tech Stack:** TypeScript (strict), Node.js 20.18+, esbuild, webpack 5 + ModuleFederationPlugin, React 19 (host-provided singleton), `@sinclair/typebox`, Express, Vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-05-12-react-config-panel-design.md`

---

## Conventions for every task

- All shell paths are absolute under `/home/dietpi/src/signalk-nmea2000-emitter-cannon`.
- All commits are local-only. Per `CLAUDE.md` workflow rules and the corresponding feedback memory, do NOT `git push`, `npm publish`, or `npm run release` until the user explicitly says go.
- Em dashes are banned everywhere (commit messages, code, comments, docs). Use colons, commas, or a sentence split.
- Live smoke tests use the systemd-managed signalk: `sudo systemctl restart signalk && sudo journalctl -u signalk -f`. The user has authorized this; do not ask permission each time.

---

## Milestone 1: TypeBox schema, conversion metadata, migration

Goal at end of milestone: plugin still loads, existing installs see their config migrated on first start, the new TypeBox-derived JSON schema is what `Plugin.schema()` returns, and `src/schema.ts` is gone. No UI work.

### Task 1: Add TypeBox dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install TypeBox**

Run:
```bash
npm install --save @sinclair/typebox@^0.34.0
```
Expected: a single line added to `dependencies`, no warnings about peer deps.

- [ ] **Step 2: Verify it imports cleanly**

Run:
```bash
node -e "import('@sinclair/typebox').then(m => console.log(typeof m.Type.Object))"
```
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add @sinclair/typebox for config schema"
```

### Task 2: Add ConversionCategory and PresetTag types

**Files:**
- Create: `src/config/schema.ts`
- Modify: `src/types/index.ts` (re-export)

- [ ] **Step 1: Write the schema file**

Create `src/config/schema.ts`:
```typescript
import { type Static, Type } from "@sinclair/typebox";

export const Categories = [
	"navigation",
	"engine",
	"electrical",
	"tanks",
	"environment",
	"ais",
	"comms",
	"system",
] as const;
export type ConversionCategory = (typeof Categories)[number];

export const PresetTags = [
	"basic-nav",
	"engine-set",
	"full-ais",
	"environmental",
	"raymarine",
] as const;
export type PresetTag = (typeof PresetTags)[number];

const ConversionCommon = Type.Object({
	enabled: Type.Boolean({ default: false }),
	resend: Type.Integer({ default: 0, minimum: 0 }),
	sources: Type.Optional(Type.Record(Type.String(), Type.String())),
});

export const Conversion = Type.Composite([
	ConversionCommon,
	Type.Object({
		extras: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
	}),
]);

export const RootConfig = Type.Object({
	globalResendInterval: Type.Integer({ default: 30, minimum: 0 }),
	conversions: Type.Record(Type.String(), Conversion, { default: {} }),
});

export type Config = Static<typeof RootConfig>;
export type ConversionConfig = Static<typeof Conversion>;
```

- [ ] **Step 2: Re-export from `src/types/index.ts`**

Find the existing block of `export type` lines in `src/types/index.ts` and add:
```typescript
export {
	Categories,
	PresetTags,
	type ConversionCategory,
	type PresetTag,
	type Config,
	type ConversionConfig,
	RootConfig,
} from "../config/schema.js";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/config/schema.ts src/types/index.ts
git commit -m "feat(config): typebox root schema with category and preset enums"
```

### Task 3: Add `category` and `presets` to ConversionModule type

**Files:**
- Modify: `src/types/plugin.ts`

- [ ] **Step 1: Update `ConversionModule` and `SubConversionModule`**

In `src/types/plugin.ts`, change `ConversionModule` to include the two new optional fields. Replace the existing interface block (lines 84-100) with:
```typescript
export interface ConversionModule<T extends unknown[] = unknown[]> {
	title: string;
	optionKey: string;
	category: import("../config/schema.js").ConversionCategory;
	presets?: import("../config/schema.js").PresetTag[];
	keys?: string[] | ((options: ConversionOptions) => string[]);
	context?: string;
	sourceType?: SourceType;
	timeouts?: number[];
	interval?: number;
	callback?(...values: T): N2KMessage[] | Promise<N2KMessage[]>;
	conversions?:
		| SubConversionModule<T>[]
		| ((options: ConversionOptions) => SubConversionModule<T>[] | null);
	tests?: ConversionTest[];
	testOptions?: unknown;
	resendTimer?: NodeJS.Timeout;
	onOptionsLoaded?: (options: ConversionOptions) => void;
}
```

`SubConversionModule` does NOT gain these fields; sub-conversions inherit category/presets from their parent at metadata-collection time (Task 9 of Milestone 2).

- [ ] **Step 2: Typecheck (will fail loudly)**

Run: `npm run typecheck`
Expected: errors in every conversion module: `Property 'category' is missing in type ...`. This is expected; the next 45 tasks would fix one at a time, but to save time we batch them in Task 4.

### Task 4: Annotate every conversion module with category and presets

**Files:**
- Modify: `src/conversions/*.ts` (44 files)

The categorization is mechanical. The following table is the authoritative mapping. Apply it exactly.

| optionKey | File | category | presets |
|---|---|---|---|
| WIND | wind.ts | navigation | basic-nav |
| DEPTH | depth.ts | navigation | basic-nav |
| COG_SOG | cogSOG.ts | navigation | basic-nav |
| HEADING | heading.ts | navigation | basic-nav |
| BATTERY | battery.ts | electrical | engine-set |
| SPEED | speed.ts | navigation | basic-nav |
| RUDDER | rudder.ts | navigation | basic-nav |
| GPS | gps.ts | navigation | basic-nav |
| TEMPERATURE / TEMPERATURE2 (temperature.ts) | temperature.ts | environment | environmental |
| PRESSURE | pressure.ts | environment | environmental |
| HUMIDITY (humidity.ts) | humidity.ts | environment | environmental |
| ENGINE_PARAMETERS | engineParameters.ts | engine | engine-set |
| TANKS | tanks.ts | tanks | engine-set |
| SYSTEM_TIME | systemTime.ts | system | (none) |
| SEA_TEMP | seaTemp.ts | environment | environmental |
| SOLAR | solar.ts | electrical | (none) |
| ENVIRONMENT_PARAMETERS | environmentParameters.ts | environment | environmental |
| MAGNETIC_VARIANCE | magneticVariance.ts | navigation | (none) |
| RATE_OF_TURN | rateOfTurn.ts | navigation | (none) |
| TRUE_HEADING | trueheading.ts | navigation | basic-nav |
| LEEWAY | leeway.ts | navigation | (none) |
| SET_DRIFT | setdrift.ts | navigation | (none) |
| ATTITUDE | attitude.ts | navigation | (none) |
| HEAVE | heave.ts | navigation | (none) |
| DIRECTION_DATA | directionData.ts | navigation | (none) |
| GNSS_DOPS / GNSS_SATELLITES (gnssData.ts) | gnssData.ts | navigation | (none) |
| AIS | ais.ts | ais | full-ais |
| AIS_* (aisExtended.ts) | aisExtended.ts | ais | full-ais |
| CROSS_TRACK_ERROR / NAVIGATION_DATA / BEARING_DISTANCE_MARKS / ROUTE_WAYPOINT / TIME_TO_MARK / NAVIGATION_DATA_GREAT_CIRCLE (navigationData.ts) | navigationData.ts | navigation | (none) |
| bearingDistanceBetweenMarks.ts | bearingDistanceBetweenMarks.ts | navigation | (none) |
| routeWaypoint.ts | routeWaypoint.ts | navigation | (none) |
| timeToMark.ts | timeToMark.ts | navigation | (none) |
| routeWpList.ts | routeWpList.ts | navigation | (none) |
| WIND_TRUE_GROUND | windTrueGround.ts | navigation | (none) |
| WIND_TRUE (windTrueWater.ts) | windTrueWater.ts | navigation | (none) |
| ENGINE_STATIC | engineStatic.ts | engine | engine-set |
| TRANSMISSION_PARAMETERS | transmissionParameters.ts | engine | engine-set |
| SMALL_CRAFT_STATUS | smallCraftStatus.ts | system | (none) |
| NOTIFICATIONS | notifications.ts | comms | (none) |
| PRODUCT_INFO | productInfo.ts | system | (none) |
| DSC_CALLS | dscCalls.ts | comms | (none) |
| RAYMARINE_ALARMS | raymarineAlarms.ts | comms | raymarine |
| PGN_LIST | pgnList.ts | system | (none) |
| RADIO_FREQUENCY | radioFrequency.ts | comms | (none) |
| RAYMARINE_BRIGHTNESS | raymarineBrightness.ts | comms | raymarine |
| EXHAUST_TEMPERATURE | (located by grep below) | engine | engine-set |

Note: `EXHAUST_TEMPERATURE` is referenced in `src/schema.ts` but the conversion module file name is not obvious. Find it before starting Step 1:
```bash
grep -rln 'optionKey:.*EXHAUST_TEMPERATURE' src/conversions/
```
If the grep returns nothing, the option key may live inside `engineParameters.ts` as a sub-conversion. In that case `category` and `presets` go on the parent module (`engineParameters.ts`) and EXHAUST_TEMPERATURE inherits them via the parent during metadata collection (Task 10).

- [ ] **Step 1: Apply the table mechanically**

For each file in the table, find the returned `ConversionModule` literal and add two fields immediately after `title` and `optionKey`:
```typescript
return {
	title: "Wind (PGN 130306)",
	optionKey: "WIND",
	category: "navigation",
	presets: ["basic-nav"],
	// ...rest unchanged
};
```

Conversions with no preset get only the `category` field; omit `presets`.

For factory-returned children (BATTERY, ENGINE_PARAMETERS, TANKS, SOLAR, EXHAUST_TEMPERATURE, RAYMARINE_BRIGHTNESS, TEMPERATURE_*, TEMPERATURE2_*): the parent `ConversionModule` gets `category` and `presets`. Sub-conversions do not (see Task 3 step 1 note).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Tests still pass**

Run: `npm test`
Expected: 21 tests pass (existing suite).

- [ ] **Step 4: Commit**

```bash
git add src/conversions/ src/types/plugin.ts
git commit -m "feat(conversions): add category and preset metadata to every conversion"
```

### Task 5: Write `migrateLegacyConfig` helper

**Files:**
- Create: `src/config/migrate.ts`
- Create: `src/test/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/migrate.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import type { Config } from "../config/schema.js";
import { migrateLegacyConfig } from "../config/migrate.js";

describe("migrateLegacyConfig", () => {
	it("returns input unchanged when already in new shape", () => {
		const already: Config = {
			globalResendInterval: 30,
			conversions: { WIND: { enabled: true, resend: 0, sources: {}, extras: {} } },
		};
		expect(migrateLegacyConfig(already)).toBe(already);
	});

	it("preserves globalResendInterval at the root", () => {
		const legacy = { globalResendInterval: 45, WIND: { enabled: true, resend: 0 } };
		const out = migrateLegacyConfig(legacy);
		expect(out.globalResendInterval).toBe(45);
	});

	it("defaults globalResendInterval to 30 when missing", () => {
		const legacy = { WIND: { enabled: true, resend: 0 } };
		const out = migrateLegacyConfig(legacy);
		expect(out.globalResendInterval).toBe(30);
	});

	it("moves enabled and resend into conversions[KEY]", () => {
		const legacy = { WIND: { enabled: true, resend: 5 } };
		const out = migrateLegacyConfig(legacy);
		expect(out.conversions.WIND).toEqual({
			enabled: true,
			resend: 5,
			sources: {},
			extras: {},
		});
	});

	it("routes string-valued legacy fields into sources", () => {
		const legacy = {
			WIND: {
				enabled: true,
				resend: 0,
				environment_wind_angleApparent: "gps1",
				environment_wind_speedApparent: "",
			},
		};
		const out = migrateLegacyConfig(legacy);
		expect(out.conversions.WIND.sources).toEqual({
			environment_wind_angleApparent: "gps1",
			environment_wind_speedApparent: "",
		});
	});

	it("routes non-string non-common fields into extras (battery example)", () => {
		const legacy = {
			BATTERY: {
				enabled: true,
				resend: 0,
				batteries: [{ signalkId: "house", instanceId: 0 }],
			},
		};
		const out = migrateLegacyConfig(legacy);
		expect(out.conversions.BATTERY.extras).toEqual({
			batteries: [{ signalkId: "house", instanceId: 0 }],
		});
	});

	it("ignores top-level non-object values that are not globalResendInterval", () => {
		const legacy = { globalResendInterval: 30, junk: "ignored", WIND: { enabled: true, resend: 0 } };
		const out = migrateLegacyConfig(legacy);
		expect(Object.keys(out.conversions)).toEqual(["WIND"]);
	});

	it("returns an empty Config for null/undefined input", () => {
		expect(migrateLegacyConfig(null).conversions).toEqual({});
		expect(migrateLegacyConfig(undefined).conversions).toEqual({});
	});
});
```

- [ ] **Step 2: Run it, see it fail**

Run: `npx vitest run src/test/migrate.test.ts`
Expected: import errors for `migrateLegacyConfig`.

- [ ] **Step 3: Write the implementation**

Create `src/config/migrate.ts`:
```typescript
import type { Config, ConversionConfig } from "./schema.js";

export function migrateLegacyConfig(raw: unknown): Config {
	if (
		raw &&
		typeof raw === "object" &&
		"conversions" in raw &&
		typeof (raw as { conversions: unknown }).conversions === "object" &&
		(raw as { conversions: unknown }).conversions !== null
	) {
		return raw as Config;
	}

	const conversions: Record<string, ConversionConfig> = {};
	let globalResendInterval = 30;

	if (raw && typeof raw === "object") {
		for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
			if (key === "globalResendInterval") {
				if (typeof value === "number") globalResendInterval = value;
				continue;
			}
			if (!value || typeof value !== "object") continue;
			const entry = value as Record<string, unknown>;
			const sources: Record<string, string> = {};
			const extras: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(entry)) {
				if (k === "enabled" || k === "resend") continue;
				if (typeof v === "string") sources[k] = v;
				else extras[k] = v;
			}
			conversions[key] = {
				enabled: typeof entry.enabled === "boolean" ? entry.enabled : false,
				resend: typeof entry.resend === "number" ? entry.resend : 0,
				sources,
				extras,
			};
		}
	}

	return { globalResendInterval, conversions };
}
```

- [ ] **Step 4: Tests pass**

Run: `npx vitest run src/test/migrate.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/config/migrate.ts src/test/migrate.test.ts
git commit -m "feat(config): load-time migration from legacy flat config shape"
```

### Task 6: Wire `Plugin.schema` to TypeBox, drop `src/schema.ts`

**Files:**
- Modify: `src/index.ts`
- Modify: `src/plugin-manager.ts` (call migrate, accept new Config type)
- Delete: `src/schema.ts`

- [ ] **Step 1: Update `src/index.ts`**

Replace the existing imports + `schema:` line. Diff the file to:
```typescript
import { RootConfig } from "./config/schema.js";
import { PluginManager } from "./plugin-manager.js";
import type { SignalKApp, SignalKPlugin } from "./types/index.js";
import { errMessage } from "./utils/errorUtils.js";

export default function createPlugin(app: SignalKApp): SignalKPlugin {
	let pluginManager: PluginManager | null = null;

	const plugin: SignalKPlugin = {
		id: "signalk-nmea2000-emitter-cannon",
		name: "Signal K NMEA2000 Emitter Cannon",
		description:
			"Plugin to convert Signal K to NMEA2000 with enhanced Garmin compatibility",
		schema: () => RootConfig,
		start: startPlugin,
		stop: stopPlugin,
	};

	function startPlugin(
		options: unknown,
		_restartPlugin?: (cfg: object) => void,
	): void {
		if (pluginManager) {
			try {
				pluginManager.stop();
			} catch (e) {
				app.error(errMessage(e));
			}
			pluginManager = null;
		}
		try {
			pluginManager = new PluginManager(app, plugin);
			pluginManager.start(options);
		} catch (error) {
			const msg = errMessage(error);
			app.error(`Failed to start plugin: ${msg}`);
			app.debug(`Full startup error: ${msg}`);
		}
	}

	function stopPlugin(): void {
		if (pluginManager) {
			pluginManager.stop();
			pluginManager = null;
		}
	}

	return plugin;
}
```

- [ ] **Step 2: Update `src/plugin-manager.ts` start signature**

Find the `start(rawOptions: ...): void` method. Change its parameter to `start(rawOptions: unknown): void`. Inside the method, immediately after entering it, call the migrator before passing to the existing normalization:
```typescript
import { migrateLegacyConfig } from "./config/migrate.js";
// inside start():
const migrated = migrateLegacyConfig(rawOptions);
// migrated.conversions and migrated.globalResendInterval are already in the new shape.
// Feed downstream loops as before; existing code already iterates conversion-by-conversion.
```

`normalizePluginOptions` and the `PluginOptions` type can stay for one more milestone; the migrated object satisfies the same access pattern (`migrated.conversions[key]`, `migrated.globalResendInterval`).

- [ ] **Step 3: Delete the old schema file**

Run:
```bash
rm src/schema.ts
```

- [ ] **Step 4: Fix imports**

Run:
```bash
grep -rln "from \"./schema" src/ ; grep -rln "from \"../schema" src/
```
For every match, delete the import line. The only legitimate import was in `src/index.ts`, already removed in Step 1.

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: 0 errors, 21+8=29 tests passing (existing 21 + 8 new migration tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(config): plugin.schema returns typebox RootConfig; drop src/schema.ts"
```

### Task 7: Milestone 1 smoke

**Files:** none.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: `dist/index.js` produced, ~350 KB.

- [ ] **Step 2: Restart signalk and tail the log**

Run:
```bash
sudo systemctl restart signalk
sudo journalctl -u signalk -n 50 --no-pager
```
Expected: plugin starts, "Loaded N conversion modules" log line, no errors.

- [ ] **Step 3: Confirm the admin UI still renders**

Manual: open the admin UI in a browser, navigate to the plugin's config tab. Since we have NOT yet added the `signalk-plugin-configurator` keyword, rjsf renders the TypeBox-derived schema. The form should look broadly similar to the v1.4.4 form (one accordion per conversion). It will not be identical; some labels are now derived from TypeBox defaults rather than hand-written `title` strings. That is expected and will be moot once the federated panel takes over.

- [ ] **Step 4: Tag the milestone**

```bash
git tag -a milestone1-typebox -m "Milestone 1 complete: TypeBox + migration"
```

(Local tag only. Do NOT push.)

---

## Milestone 2: API router, discovery, status snapshot, admin auth

Goal: `curl --user admin:<pass> http://localhost:3000/plugins/signalk-nmea2000-emitter-cannon/api/status` returns JSON; the same URL without auth returns 401. Discovery endpoints return live data from the running server.

### Task 8: API response types

**Files:**
- Create: `src/api/types.ts`

- [ ] **Step 1: Write the types**

Create `src/api/types.ts`:
```typescript
import type { ConversionCategory, PresetTag } from "../config/schema.js";

export interface StatusSnapshot {
	nmea2000Ready: boolean;
	enabledCount: number;
	totalConversions: number;
	perConversion: PerConversionStatus[];
	startTime: number;
}

export interface PerConversionStatus {
	key: string;
	title: string;
	enabled: boolean;
	lastEmitMs?: number;
	emitCount: number;
	lastErrorMessage?: string;
	lastErrorAgeMs?: number;
}

export type ExtrasMeta =
	| { type: "none" }
	| { type: "batteryMapping" | "engineMapping" | "tankMapping" | "solarMapping" | "brightnessMapping" | "exhaustMapping"; minRows: 0 }
	| {
			type: "field";
			key: string;
			label: string;
			control: "text" | "number" | "boolean";
			default?: unknown;
	  };

export interface ConversionMetadata {
	key: string;
	title: string;
	pgns: string[];
	category: ConversionCategory;
	presets: PresetTag[];
	paths: string[];
	extras: ExtrasMeta;
}

export interface ConversionsResponse {
	conversions: ConversionMetadata[];
}

export interface PathsResponse {
	paths: string[];
}

export interface SourcesResponse {
	sources: string[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(api): response shape types for status/conversions/paths/sources"
```

### Task 9: Status snapshot builder

**Files:**
- Modify: `src/plugin-manager.ts` (add private state + public `getStatusSnapshot`)
- Create: `src/test/status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/status.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { PluginManager } from "../plugin-manager.js";
import { mockApp } from "./helpers.js"; // existing mock; or inline {} cast as needed

describe("PluginManager.getStatusSnapshot", () => {
	it("returns the canonical shape even before start()", () => {
		const app = mockApp();
		const plugin = { id: "x", name: "x", description: "x", schema: () => ({}), start: () => {}, stop: () => {} };
		const pm = new PluginManager(app, plugin as never);
		const snap = pm.getStatusSnapshot();
		expect(snap).toHaveProperty("nmea2000Ready");
		expect(snap).toHaveProperty("enabledCount", 0);
		expect(snap).toHaveProperty("totalConversions");
		expect(snap.perConversion).toEqual([]);
	});
});
```

If `mockApp` does not exist in `src/test/helpers.ts`, look at `src/test/index.test.ts` for the existing mock app shape and reuse it inline.

- [ ] **Step 2: See it fail**

Run: `npx vitest run src/test/status.test.ts`
Expected: error: `pm.getStatusSnapshot is not a function`.

- [ ] **Step 3: Add fields and method to PluginManager**

In `src/plugin-manager.ts`, add new private fields after the existing `errorBuckets` declaration:
```typescript
private emitCounts: Map<string, number> = new Map();
private lastEmitAt: Map<string, number> = new Map();
private startTime = Date.now();
```

Inside the existing `processOutput` method (or whichever method records each emit), increment counters by `optionKey`:
```typescript
private recordEmit(key: string): void {
	this.emitCounts.set(key, (this.emitCounts.get(key) ?? 0) + 1);
	this.lastEmitAt.set(key, Date.now());
}
```

Call `this.recordEmit(conversion.optionKey)` from the existing emit path. Locate the existing call site that invokes `app.emit("nmea2000JsonOut", ...)` or its abstraction; immediately after the emit, call `recordEmit`.

Add the public method:
```typescript
public getStatusSnapshot(): import("./api/types.js").StatusSnapshot {
	const now = Date.now();
	const enabledKeys = this.lastEnabledKeys ?? new Set<string>();
	const perConversion: import("./api/types.js").PerConversionStatus[] = this.conversions.map((c) => {
		const lastEmitAt = this.lastEmitAt.get(c.optionKey);
		const bucket = this.errorBuckets.get(`callback:${c.optionKey}:stream`);
		return {
			key: c.optionKey,
			title: c.title,
			enabled: enabledKeys.has(c.optionKey),
			emitCount: this.emitCounts.get(c.optionKey) ?? 0,
			lastEmitMs: lastEmitAt !== undefined ? now - lastEmitAt : undefined,
			lastErrorMessage: bucket?.lastMessage,
			lastErrorAgeMs: bucket?.lastEmittedAt !== undefined ? now - bucket.lastEmittedAt : undefined,
		};
	});

	return {
		nmea2000Ready: this.nmea2000Ready,
		enabledCount: this.lastEnabledCount,
		totalConversions: this.conversions.length,
		perConversion,
		startTime: this.startTime,
	};
}
```

Also add:
```typescript
private lastEnabledKeys: Set<string> | null = null;
```

In `start()`, where it sets `this.lastEnabledCount = enabledCount`, also record:
```typescript
this.lastEnabledKeys = new Set(enabledConversions.map((c) => c.optionKey));
```

(Use whichever variable already represents the enabled conversion list in `start()`; rename if needed.)

In `stop()`, reset `this.emitCounts.clear()`, `this.lastEmitAt.clear()`, `this.lastEnabledKeys = null`.

The `errorBuckets` entries gain two new optional fields (`lastMessage?: string`, `lastEmittedAt?: number`). Find the existing bucket-write site (where the throttled error first emits) and capture the message and timestamp at that point:
```typescript
bucket.lastMessage = message;
bucket.lastEmittedAt = now;
```

Update the inline type of `errorBuckets` accordingly.

- [ ] **Step 4: Tests pass**

Run: `npm test`
Expected: 30 tests passing (existing 29 + 1 new status test). If the smoke test fails because `mockApp` is missing, write a minimal inline cast in the test instead.

- [ ] **Step 5: Commit**

```bash
git add src/plugin-manager.ts src/test/status.test.ts
git commit -m "feat(plugin-manager): emit counters and getStatusSnapshot"
```

### Task 10: Conversion metadata builder

**Files:**
- Modify: `src/plugin-manager.ts` (add `getConversionMetadata`)
- Create: `src/api/extras-meta.ts`

- [ ] **Step 1: Write the extras-meta resolver**

Create `src/api/extras-meta.ts`:
```typescript
import type { ConversionModule } from "../types/index.js";
import type { ExtrasMeta } from "./types.js";

const EXTRAS_BY_OPTION_KEY: Record<string, ExtrasMeta> = {
	BATTERY: { type: "batteryMapping", minRows: 0 },
	ENGINE_PARAMETERS: { type: "engineMapping", minRows: 0 },
	TANKS: { type: "tankMapping", minRows: 0 },
	SOLAR: { type: "solarMapping", minRows: 0 },
	RAYMARINE_BRIGHTNESS: { type: "brightnessMapping", minRows: 0 },
	EXHAUST_TEMPERATURE: { type: "exhaustMapping", minRows: 0 },
	NOTIFICATIONS: {
		type: "field",
		key: "excludePaths",
		label: "Exclude Paths",
		control: "text",
		default: "",
	},
};

// Temperature instance editor: applies to every TEMPERATURE_* / TEMPERATURE2_* key.
const TEMPERATURE_INSTANCE_META: ExtrasMeta = {
	type: "field",
	key: "instance",
	label: "NMEA 2000 Temperature Instance",
	control: "number",
};

export function metaFor(conversion: ConversionModule): ExtrasMeta {
	const k = conversion.optionKey;
	if (k.startsWith("TEMPERATURE_") || k.startsWith("TEMPERATURE2_")) {
		return TEMPERATURE_INSTANCE_META;
	}
	return EXTRAS_BY_OPTION_KEY[k] ?? { type: "none" };
}
```

- [ ] **Step 2: Add `getConversionMetadata` to PluginManager**

In `src/plugin-manager.ts`:
```typescript
import { metaFor } from "./api/extras-meta.js";
import type { ConversionMetadata } from "./api/types.js";

public getConversionMetadata(): ConversionMetadata[] {
	return this.conversions.map((c) => ({
		key: c.optionKey,
		title: c.title,
		pgns: extractPgnsFromTitle(c.title),
		category: c.category,
		presets: c.presets ?? [],
		paths: typeof c.keys === "function" ? [] : (c.keys ?? []),
		extras: metaFor(c),
	}));
}
```

Helper at file top or in a util:
```typescript
function extractPgnsFromTitle(title: string): string[] {
	const match = title.match(/PGNs?\s+([\d,\s]+)\)/);
	if (!match) return [];
	return match[1].split(",").map((s) => s.trim()).filter(Boolean);
}
```

- [ ] **Step 3: Quick smoke test**

Add to `src/test/status.test.ts`:
```typescript
it("getConversionMetadata returns one entry per loaded conversion", () => {
	const app = mockApp();
	const plugin = { id: "x", name: "x", description: "x", schema: () => ({}), start: () => {}, stop: () => {} };
	const pm = new PluginManager(app, plugin as never);
	const meta = pm.getConversionMetadata();
	expect(meta.length).toBeGreaterThan(40);
	expect(meta[0]).toHaveProperty("key");
	expect(meta[0]).toHaveProperty("category");
	expect(meta[0]).toHaveProperty("extras");
});
```

Run: `npm test`. Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/plugin-manager.ts src/api/extras-meta.ts src/test/status.test.ts
git commit -m "feat(plugin-manager): getConversionMetadata for /api/conversions endpoint"
```

### Task 11: Discovery helpers

**Files:**
- Create: `src/api/discovery.ts`
- Create: `src/test/discovery.test.ts`

**As-built note:** the snippets below sketch walking the `/sources` tree via `app.getPath("/sources")`. The actual implementation switched to `app.getSelfPath(path)` during M2, reading the per-path `values` map (keyed by `$source` ID) directly. `app.getPath("vessels.self.<path>")` does NOT resolve the `self` indirection, and the `/sources` tree stores device metadata, not path-keyed source listings. The discovery test was rewritten against the `getSelfPath` shape.

- [ ] **Step 1: Write the failing test**

Create `src/test/discovery.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { enumerateActivePaths, enumerateSourcesForPath } from "../api/discovery.js";

function mockApp(paths: string[], sourcesTree: Record<string, unknown>): any {
	return {
		streambundle: { getAvailablePaths: () => paths },
		getPath: (p: string) => (p === "/sources" ? sourcesTree : undefined),
	};
}

describe("enumerateActivePaths", () => {
	it("returns sorted unique paths", () => {
		const app = mockApp(["b", "a", "a"], {});
		expect(enumerateActivePaths(app)).toEqual(["a", "b"]);
	});
	it("returns empty when no paths published", () => {
		const app = mockApp([], {});
		expect(enumerateActivePaths(app)).toEqual([]);
	});
});

describe("enumerateSourcesForPath", () => {
	it("walks the /sources tree and collects $source labels that have the target path", () => {
		const tree = {
			"nmea0183": {
				"II": { navigation: { position: {} } },
			},
			"derived-data": { navigation: { position: {} } },
			"gps1": { navigation: { headingTrue: {} } },
		};
		const app = mockApp([], tree);
		const sources = enumerateSourcesForPath(app, "navigation.position");
		expect(sources).toContain("nmea0183.II");
		expect(sources).toContain("derived-data");
		expect(sources).not.toContain("gps1");
	});
	it("returns empty when /sources is missing", () => {
		const app = mockApp([], undefined as never);
		expect(enumerateSourcesForPath(app, "x")).toEqual([]);
	});
});
```

- [ ] **Step 2: See it fail**

Run: `npx vitest run src/test/discovery.test.ts`
Expected: import errors.

- [ ] **Step 3: Implement**

Create `src/api/discovery.ts`:
```typescript
import type { Path } from "@signalk/server-api";
import type { SignalKApp } from "../types/index.js";

export function enumerateActivePaths(app: SignalKApp): string[] {
	const raw = app.streambundle?.getAvailablePaths?.() ?? [];
	const set = new Set<string>();
	for (const p of raw) set.add(String(p));
	return [...set].sort();
}

export function enumerateSourcesForPath(app: SignalKApp, path: string): string[] {
	const tree = app.getPath?.("/sources" as Path);
	if (!tree || typeof tree !== "object") return [];
	const out = new Set<string>();
	const parts = path.split(".");
	walk(tree as Record<string, unknown>, parts, [], out);
	return [...out].sort();
}

function walk(
	node: Record<string, unknown>,
	pathParts: string[],
	sourceLabelStack: string[],
	out: Set<string>,
): void {
	if (sourceLabelStack.length > 0 && hasPath(node, pathParts)) {
		out.add(sourceLabelStack.join("."));
		return;
	}
	for (const [k, v] of Object.entries(node)) {
		if (v && typeof v === "object" && !Array.isArray(v)) {
			walk(v as Record<string, unknown>, pathParts, [...sourceLabelStack, k], out);
		}
	}
}

function hasPath(node: unknown, parts: string[]): boolean {
	let cur: unknown = node;
	for (const p of parts) {
		if (!cur || typeof cur !== "object") return false;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur !== undefined;
}
```

Note: the walk depth equals `/sources` tree depth (typically 2-3); this is not hot path.

- [ ] **Step 4: Tests pass**

Run: `npx vitest run src/test/discovery.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/discovery.ts src/test/discovery.test.ts
git commit -m "feat(api): path and source discovery helpers"
```

### Task 12: Express router factory

**Files:**
- Create: `src/api/router.ts`
- Modify: `src/types/signalk.ts` (add securityStrategy declaration)

- [ ] **Step 1: Extend `SignalKApp` with `securityStrategy`**

In `src/types/signalk.ts`, add inside the `SignalKApp` interface:
```typescript
securityStrategy: {
	addAdminMiddleware: (pathPrefix: string) => void;
};
```

If the type clashes with `@signalk/server-api`, use a separate type intersection: `export interface SignalKApp extends ServerAPI { ... } & { securityStrategy?: { addAdminMiddleware: (p: string) => void } }`.

- [ ] **Step 2: Write the router**

Create `src/api/router.ts`:
```typescript
import type { IRouter, Request, Response } from "express";
import { enumerateActivePaths, enumerateSourcesForPath } from "./discovery.js";
import type { SignalKApp } from "../types/index.js";
import type { PluginManager } from "../plugin-manager.js";
import type {
	ConversionsResponse,
	PathsResponse,
	SourcesResponse,
} from "./types.js";

const API_PREFIX = "/plugins/signalk-nmea2000-emitter-cannon/api";

export function createApiRouter(
	app: SignalKApp,
	getManager: () => PluginManager | null,
): (router: IRouter) => void {
	return (router) => {
		app.securityStrategy?.addAdminMiddleware?.(API_PREFIX);

		router.get("/api/status", (_req: Request, res: Response) => {
			const pm = getManager();
			if (!pm) {
				res.json({
					nmea2000Ready: false,
					enabledCount: 0,
					totalConversions: 0,
					perConversion: [],
					startTime: 0,
				});
				return;
			}
			res.json(pm.getStatusSnapshot());
		});

		router.get("/api/conversions", (_req: Request, res: Response) => {
			const pm = getManager();
			const body: ConversionsResponse = {
				conversions: pm ? pm.getConversionMetadata() : [],
			};
			res.json(body);
		});

		router.get("/api/paths", (_req: Request, res: Response) => {
			const body: PathsResponse = { paths: enumerateActivePaths(app) };
			res.json(body);
		});

		router.get("/api/sources", (req: Request, res: Response) => {
			const path = String(req.query.path ?? "");
			if (!path) {
				res.status(400).json({ error: "path required" });
				return;
			}
			const body: SourcesResponse = {
				sources: enumerateSourcesForPath(app, path),
			};
			res.json(body);
		});
	};
}
```

`getManager` is a closure: `src/index.ts` passes `() => pluginManager` so the router always sees the current instance (PluginManager is recreated on every start/stop cycle).

- [ ] **Step 3: Wire `registerWithRouter` in `src/index.ts`**

In `src/index.ts`, add inside `createPlugin(app)` after `const plugin = { ... }`:
```typescript
import { createApiRouter } from "./api/router.js";
// ...
plugin.registerWithRouter = createApiRouter(app, () => pluginManager);
```

(`registerWithRouter` is optional on `Plugin`; assigning it post-construction is fine.)

- [ ] **Step 4: Add `express` as a devDependency**

Run:
```bash
npm install --save-dev express @types/express supertest @types/supertest
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): express router with status/conversions/paths/sources and admin auth"
```

### Task 13: Integration test for the API router

**Files:**
- Create: `src/test/api.test.ts`

- [ ] **Step 1: Write the test**

Create `src/test/api.test.ts`:
```typescript
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../api/router.js";

function mountRouter(app: any, getPm: () => any) {
	const expressApp = express();
	const router = express.Router();
	createApiRouter(app, getPm)(router);
	expressApp.use("/plugins/signalk-nmea2000-emitter-cannon", router);
	return expressApp;
}

describe("API router", () => {
	const fakeApp = {
		streambundle: { getAvailablePaths: () => ["a", "b"] },
		getPath: (p: string) => (p === "/sources" ? { gps1: { navigation: { position: {} } } } : undefined),
		securityStrategy: { addAdminMiddleware: vi.fn() },
	};

	it("GET /api/status returns the canonical shape", async () => {
		const pm = {
			getStatusSnapshot: () => ({
				nmea2000Ready: true,
				enabledCount: 3,
				totalConversions: 45,
				perConversion: [],
				startTime: 1000,
			}),
			getConversionMetadata: () => [],
		};
		const ex = mountRouter(fakeApp, () => pm);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/status");
		expect(res.status).toBe(200);
		expect(res.body.enabledCount).toBe(3);
	});

	it("GET /api/conversions returns an array under .conversions", async () => {
		const pm = {
			getStatusSnapshot: () => ({} as any),
			getConversionMetadata: () => [{ key: "WIND" } as any],
		};
		const ex = mountRouter(fakeApp, () => pm);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/conversions");
		expect(res.body.conversions).toEqual([{ key: "WIND" }]);
	});

	it("GET /api/paths returns sorted paths", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/paths");
		expect(res.body.paths).toEqual(["a", "b"]);
	});

	it("GET /api/sources?path=navigation.position returns the source", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=navigation.position");
		expect(res.body.sources).toContain("gps1");
	});

	it("GET /api/sources without path returns 400", async () => {
		const ex = mountRouter(fakeApp, () => null);
		const res = await request(ex).get("/plugins/signalk-nmea2000-emitter-cannon/api/sources");
		expect(res.status).toBe(400);
	});

	it("calls addAdminMiddleware with the api prefix", async () => {
		mountRouter(fakeApp, () => null);
		expect(fakeApp.securityStrategy.addAdminMiddleware).toHaveBeenCalledWith(
			"/plugins/signalk-nmea2000-emitter-cannon/api",
		);
	});
});
```

- [ ] **Step 2: Run**

Run: `npm test`
Expected: 6 new tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/test/api.test.ts
git commit -m "test(api): integration tests for router endpoints and admin middleware"
```

### Task 14: Live smoke for Milestone 2

- [ ] **Step 1: Build, restart, curl**

Run:
```bash
npm run build
sudo systemctl restart signalk
sleep 3
# Determine the admin password / token method. The user has signalk-server admin auth configured;
# replicate whatever auth flow other manual tests use. If basic auth is in play:
curl -u admin:<pass> http://localhost:3000/plugins/signalk-nmea2000-emitter-cannon/api/status | jq .
curl -u admin:<pass> http://localhost:3000/plugins/signalk-nmea2000-emitter-cannon/api/conversions | jq '.conversions | length'
curl -u admin:<pass> "http://localhost:3000/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=navigation.position" | jq .
# Unauthenticated request must 401:
curl -i http://localhost:3000/plugins/signalk-nmea2000-emitter-cannon/api/status | head -5
```

Expected:
- Status JSON with `nmea2000Ready`, `enabledCount`, `totalConversions`, `perConversion`.
- Conversions count >= 45.
- Sources array (may be empty if `navigation.position` has no live publisher).
- 401 Unauthorized for the unauthenticated GET.

If the 401 does NOT happen, the open question in the spec (middleware ordering) was wrong; fix by moving `app.securityStrategy.addAdminMiddleware(...)` out of `registerWithRouter` and into `startPlugin` in `src/index.ts`, then rebuild and re-test.

- [ ] **Step 2: Tag**

```bash
git tag -a milestone2-api -m "Milestone 2 complete: API router and admin auth"
```

---

## Milestone 3: Webpack federation skeleton

Goal: signalk admin UI loads a minimal `PluginConfigurationPanel` from this plugin's `public/remoteEntry.js`. The panel renders `Loaded N conversions` text. No real functionality yet.

### Task 15: Install panel devDependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run:
```bash
npm install --save-dev \
  webpack@^5.105.0 webpack-cli@^7.0.0 \
  babel-loader@^10.0.0 \
  @babel/core@^7.29.0 @babel/preset-react@^7.28.0 @babel/preset-typescript@^7.28.0 \
  react@^19.2.0 react-dom@^19.2.0 \
  @types/react@^19.2.0 @types/react-dom@^19.2.0
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add webpack 5 + react 19 devDeps for federated panel"
```

### Task 16: Panel tsconfig

**Files:**
- Create: `tsconfig.panel.json`

- [ ] **Step 1: Write the file**

Create `tsconfig.panel.json`:
```json
{
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"jsx": "react-jsx",
		"lib": ["DOM", "DOM.Iterable", "ES2022"],
		"types": ["react", "react-dom"],
		"moduleResolution": "Bundler",
		"noEmit": true
	},
	"include": ["src/panel/**/*", "src/config/**/*", "src/api/types.ts"]
}
```

- [ ] **Step 2: Wire `npm run typecheck` to run both**

Edit `package.json` `scripts.typecheck`:
```json
"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.panel.json"
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.panel.json package.json
git commit -m "chore(build): tsconfig.panel.json for the React panel build target"
```

### Task 17: webpack.config.cjs

**Files:**
- Create: `webpack.config.cjs`

- [ ] **Step 1: Write the file**

Create `webpack.config.cjs` (CommonJS extension because `package.json` has `"type": "module"`, so plain `.js` would be parsed as ESM):
```javascript
const path = require("node:path");
const webpack = require("webpack");
const pkg = require("./package.json");

const safeName = pkg.name.replace(/[-@/]/g, "_");

module.exports = {
	entry: "./src/panel/index.tsx",
	mode: "production",
	output: {
		path: path.resolve(__dirname, "public"),
		clean: false,
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: "babel-loader",
				exclude: /node_modules/,
				options: {
					presets: [
						["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
						["@babel/preset-react", { runtime: "automatic" }],
					],
				},
			},
		],
	},
	resolve: { extensions: [".tsx", ".ts", ".jsx", ".js"] },
	plugins: [
		new webpack.container.ModuleFederationPlugin({
			name: safeName,
			library: { type: "var", name: safeName },
			filename: "remoteEntry.js",
			exposes: {
				"./PluginConfigurationPanel": "./src/panel/PluginConfigurationPanel",
			},
			shared: {
				react: { singleton: true, requiredVersion: "^19" },
				"react-dom": { singleton: true, requiredVersion: "^19" },
			},
		}),
	],
};
```

- [ ] **Step 2: Update `package.json` scripts**

Replace the existing `build`, `build:watch`, and `clean` scripts with:
```json
"build": "npm run clean && npm run build:plugin && npm run build:panel",
"build:plugin": "esbuild src/index.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/index.js --external:rxjs",
"build:panel": "webpack --config webpack.config.cjs",
"build:watch": "concurrently -k -n plugin,panel \"esbuild src/index.ts --bundle --platform=node --target=node22 --format=esm --sourcemap=linked --outfile=dist/index.js --external:rxjs --watch\" \"webpack --config webpack.config.cjs --watch\"",
"clean": "rm -rf dist && rm -f public/*.js public/*.LICENSE.txt public/*.map"
```

If you do not want to add `concurrently` as a devDep, simplify `build:watch` to a single target (plugin watch). The user authorized restarting signalk by hand between iterations, so running watches separately is fine.

- [ ] **Step 3: Add `signalk-plugin-configurator` keyword and `public/` to `files`**

In `package.json`:
```json
"keywords": [
	"signalk-node-server-plugin",
	"signalk-plugin-configurator",
	"signalk-category-nmea-2000",
	"signalk-category-ais",
	"nmea2000",
	"garmin",
	"marine-electronics",
	"ais",
	"navigation"
],
"files": [
	"dist/",
	"public/",
	"assets/",
	"README.md",
	"LICENSE",
	"CHANGELOG.md"
]
```

- [ ] **Step 4: Commit**

```bash
git add webpack.config.cjs package.json
git commit -m "feat(build): webpack federation config and updated build scripts"
```

### Task 18: Minimal federated panel

**Files:**
- Create: `src/panel/index.tsx`
- Create: `src/panel/PluginConfigurationPanel.tsx`

**As-built note:** the Task 17 config above sketches `library: { type: "var" }`, which is the legacy script-tag federation contract. The actual implementation switched to ESM federation at the end of milestone 3 (`experiments.outputModule: true`, `output.module: true`, `output.filename: "[name].mjs"`, `library: { type: "module" }` on both the `output` block and the `ModuleFederationPlugin`) because `package.json` declares `"type": "module"` and the admin UI therefore injects `remoteEntry.js` as `<script type="module">`. The `var`-typed remote was rejected by the admin runtime in the milestone-3 smoke and the change was applied before tagging `milestone3-skeleton`.

- [ ] **Step 1: Federation entry**

Create `src/panel/index.tsx`:
```typescript
export { default } from "./PluginConfigurationPanel";
```

- [ ] **Step 2: Stub panel**

Create `src/panel/PluginConfigurationPanel.tsx`:
```typescript
import React, { useEffect, useState } from "react";
import type { ConversionsResponse } from "../api/types.js";

interface Props {
	configuration: unknown;
	save: (configuration: unknown) => void;
}

export default function PluginConfigurationPanel(_props: Props): JSX.Element {
	const [count, setCount] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/plugins/signalk-nmea2000-emitter-cannon/api/conversions")
			.then((r) => r.json() as Promise<ConversionsResponse>)
			.then((d) => setCount(d.conversions.length))
			.catch((e) => setError(String(e)));
	}, []);

	return (
		<div style={{ padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
			<h2>NMEA2000 Emitter Cannon</h2>
			{error ? <p style={{ color: "crimson" }}>Error: {error}</p> : null}
			{count !== null ? <p>Loaded {count} conversions.</p> : <p>Loading...</p>}
		</div>
	);
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `dist/index.js` produced; `public/remoteEntry.js` produced; chunk files in `public/`.

- [ ] **Step 4: Restart signalk and verify**

Run:
```bash
sudo systemctl restart signalk
sleep 3
curl -i http://localhost:3000/signalk-nmea2000-emitter-cannon/remoteEntry.js | head -3
```
Expected: 200 OK; the body starts with `var signalk_nmea2000_emitter_cannon=(()=>{...`.

Manual: open the admin UI, navigate to plugin config. Expected: a tab labeled "Signal K NMEA2000 Emitter Cannon" with "Loaded N conversions." (where N is around 45). Existing form should be gone.

- [ ] **Step 5: Commit**

```bash
git add src/panel/ public/
git commit -m "feat(panel): minimal federated panel rendering conversion count"
```

If `public/` is gitignored (it should not be; we want it in the npm tarball but optionally not in git): check `.gitignore`. If gitignored, decide. Recommendation: keep `public/` OUT of git (built artifact), since `prepublishOnly` rebuilds before pack. The `files` array still ships it in the npm tarball. If you go this route, do NOT `git add public/` in this commit.

- [ ] **Step 6: Tag**

```bash
git tag -a milestone3-skeleton -m "Milestone 3 complete: federated skeleton renders in admin UI"
```

---

## Milestone 4: Status dashboard

Goal: panel header shows live readiness, enabled count, message rate, last error.

### Task 19: useStatus hook with visibility-aware polling

**Files:**
- Create: `src/panel/hooks/useStatus.ts`

- [ ] **Step 1: Write the hook**

Create `src/panel/hooks/useStatus.ts`:
```typescript
import { useEffect, useRef, useState } from "react";
import type { StatusSnapshot } from "../../api/types.js";

const URL = "/plugins/signalk-nmea2000-emitter-cannon/api/status";
const POLL_MS = 3000;

export function useStatus(): {
	status: StatusSnapshot | null;
	error: string | null;
} {
	const [status, setStatus] = useState<StatusSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const cancelled = useRef(false);

	useEffect(() => {
		cancelled.current = false;

		async function tick(): Promise<void> {
			try {
				const r = await fetch(URL, { credentials: "same-origin" });
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				const body = (await r.json()) as StatusSnapshot;
				if (!cancelled.current) {
					setStatus(body);
					setError(null);
				}
			} catch (e) {
				if (!cancelled.current) setError(String(e));
			}
		}

		void tick();
		let id: ReturnType<typeof setInterval> | null = setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, POLL_MS);

		const onVisibility = (): void => {
			if (document.visibilityState === "visible") void tick();
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			cancelled.current = true;
			if (id !== null) clearInterval(id);
			id = null;
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, []);

	return { status, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panel/hooks/useStatus.ts
git commit -m "feat(panel): useStatus hook with 3s poll and visibility pause"
```

### Task 20: StatusDashboard component

**Files:**
- Create: `src/panel/styles.ts`
- Create: `src/panel/components/StatusDashboard.tsx`
- Modify: `src/panel/PluginConfigurationPanel.tsx`

- [ ] **Step 1: Inline styles file**

Create `src/panel/styles.ts`:
```typescript
import type { CSSProperties } from "react";

export const S: Record<string, CSSProperties> = {
	root: {
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		color: "#333",
		padding: "16px 0",
	},
	statusBar: {
		display: "flex",
		gap: 18,
		padding: "12px 16px",
		background: "#f8f9fa",
		border: "1px solid #e0e0e0",
		borderRadius: 10,
		marginBottom: 16,
		alignItems: "center",
		fontSize: 13,
	},
	dot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
	dotOk: { background: "#22c55e" },
	dotWait: { background: "#f59e0b" },
	dotOff: { background: "#9ca3af" },
	statLabel: { color: "#777" },
	statValue: { fontWeight: 600, marginLeft: 4 },
	errorBadge: {
		background: "#fee2e2",
		color: "#991b1b",
		padding: "2px 8px",
		borderRadius: 4,
		fontSize: 12,
	},
};
```

- [ ] **Step 2: StatusDashboard component**

Create `src/panel/components/StatusDashboard.tsx`:
```typescript
import React from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { S } from "../styles.js";

export default function StatusDashboard({ status }: { status: StatusSnapshot | null }): JSX.Element {
	if (!status) {
		return (
			<div style={S.statusBar}>
				<span style={{ ...S.dot, ...S.dotOff }} />
				<span>Loading status...</span>
			</div>
		);
	}
	const ready = status.nmea2000Ready;
	const dot = ready ? S.dotOk : S.dotWait;
	const errors = status.perConversion.filter((c) => c.lastErrorMessage).length;
	return (
		<div style={S.statusBar}>
			<span style={{ ...S.dot, ...dot }} title={ready ? "NMEA 2000 ready" : "Waiting for NMEA 2000 output"} />
			<span>
				<span style={S.statLabel}>Enabled</span>
				<span style={S.statValue}>{status.enabledCount} / {status.totalConversions}</span>
			</span>
			<span>
				<span style={S.statLabel}>NMEA 2000</span>
				<span style={S.statValue}>{ready ? "ready" : "waiting"}</span>
			</span>
			{errors > 0 ? <span style={S.errorBadge}>{errors} error{errors > 1 ? "s" : ""}</span> : null}
		</div>
	);
}
```

- [ ] **Step 3: Wire into PluginConfigurationPanel**

Replace `src/panel/PluginConfigurationPanel.tsx`:
```typescript
import React from "react";
import StatusDashboard from "./components/StatusDashboard";
import { useStatus } from "./hooks/useStatus";
import { S } from "./styles";

interface Props {
	configuration: unknown;
	save: (configuration: unknown) => void;
}

export default function PluginConfigurationPanel(_props: Props): JSX.Element {
	const { status, error } = useStatus();
	return (
		<div style={S.root}>
			<StatusDashboard status={status} />
			{error ? <p style={{ color: "crimson", fontSize: 12 }}>Status error: {error}</p> : null}
			<p>Conversion cards coming next.</p>
		</div>
	);
}
```

- [ ] **Step 4: Build, restart, eyeball**

Run: `npm run build && sudo systemctl restart signalk`. Expected: panel shows a status bar with dot, enabled count, NMEA 2000 state.

- [ ] **Step 5: Commit**

```bash
git add src/panel/
git commit -m "feat(panel): status dashboard with 3s polling"
```

---

## Milestone 5: Conversion cards, source dropdowns, save flow

Goal: full conversion list rendered as cards under tabs, with enable/resend/source dropdowns; explicit Save persists through `save(config)`.

### Task 21: useConfig reducer

**Files:**
- Create: `src/panel/hooks/useConfig.ts`

- [ ] **Step 1: Write it**

Create `src/panel/hooks/useConfig.ts`:
```typescript
import { useReducer, useEffect } from "react";
import type { Config, PresetTag } from "../../config/schema.js";
import type { ConversionMetadata } from "../../api/types.js";

type Action =
	| { type: "init"; config: Config }
	| { type: "setEnabled"; key: string; enabled: boolean }
	| { type: "setResend"; key: string; ms: number }
	| { type: "setSource"; key: string; path: string; source: string }
	| { type: "setExtras"; key: string; extras: Record<string, unknown> }
	| { type: "setGlobalResend"; ms: number }
	| { type: "applyPreset"; preset: PresetTag; meta: ConversionMetadata[] }
	| { type: "discard"; config: Config };

function ensureKey(s: Config, key: string): Config {
	if (s.conversions[key]) return s;
	return {
		...s,
		conversions: {
			...s.conversions,
			[key]: { enabled: false, resend: 0, sources: {}, extras: {} },
		},
	};
}

function reducer(state: Config, action: Action): Config {
	switch (action.type) {
		case "init":
		case "discard":
			return action.config;
		case "setGlobalResend":
			return { ...state, globalResendInterval: action.ms };
		case "setEnabled": {
			const s = ensureKey(state, action.key);
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...s.conversions[action.key], enabled: action.enabled },
				},
			};
		}
		case "setResend": {
			const s = ensureKey(state, action.key);
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...s.conversions[action.key], resend: action.ms },
				},
			};
		}
		case "setSource": {
			const s = ensureKey(state, action.key);
			const sources = { ...(s.conversions[action.key].sources ?? {}) };
			if (action.source) sources[action.path] = action.source;
			else delete sources[action.path];
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...s.conversions[action.key], sources },
				},
			};
		}
		case "setExtras": {
			const s = ensureKey(state, action.key);
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...s.conversions[action.key], extras: action.extras },
				},
			};
		}
		case "applyPreset": {
			let next = state;
			for (const m of action.meta) {
				if (m.presets.includes(action.preset)) {
					next = ensureKey(next, m.key);
					next = {
						...next,
						conversions: {
							...next.conversions,
							[m.key]: { ...next.conversions[m.key], enabled: true },
						},
					};
				}
			}
			return next;
		}
	}
}

const EMPTY: Config = { globalResendInterval: 30, conversions: {} };

export function useConfig(initial: unknown): {
	state: Config;
	dispatch: React.Dispatch<Action>;
} {
	const [state, dispatch] = useReducer(reducer, EMPTY);
	useEffect(() => {
		if (initial && typeof initial === "object" && "conversions" in initial) {
			dispatch({ type: "init", config: initial as Config });
		} else {
			// Legacy shape from the host. Use the same migration helper.
			import("../../config/migrate.js").then((m) => {
				dispatch({ type: "init", config: m.migrateLegacyConfig(initial) });
			});
		}
	}, [initial]);
	return { state, dispatch };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panel/hooks/useConfig.ts
git commit -m "feat(panel): useConfig reducer with action set for v1 features"
```

### Task 22: useSources hook (per-path lazy fetch)

**Files:**
- Create: `src/panel/hooks/useSources.ts`

- [ ] **Step 1: Write it**

Create `src/panel/hooks/useSources.ts`:
```typescript
import { useCallback, useRef, useState } from "react";

const CACHE_TTL_MS = 30_000;

export function useSources(): {
	sourcesFor: (path: string) => string[];
	ensureLoaded: (path: string) => Promise<void>;
} {
	const cache = useRef<Map<string, { ts: number; sources: string[] }>>(new Map());
	const [, force] = useState(0);

	const ensureLoaded = useCallback(async (path: string) => {
		const hit = cache.current.get(path);
		if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return;
		try {
			const r = await fetch(
				`/plugins/signalk-nmea2000-emitter-cannon/api/sources?path=${encodeURIComponent(path)}`,
				{ credentials: "same-origin" },
			);
			const body = (await r.json()) as { sources: string[] };
			cache.current.set(path, { ts: Date.now(), sources: body.sources });
			force((n) => n + 1);
		} catch {
			cache.current.set(path, { ts: Date.now(), sources: [] });
			force((n) => n + 1);
		}
	}, []);

	const sourcesFor = useCallback(
		(path: string) => cache.current.get(path)?.sources ?? [],
		[],
	);

	return { sourcesFor, ensureLoaded };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panel/hooks/useSources.ts
git commit -m "feat(panel): useSources lazy per-path cache (30s TTL)"
```

### Task 23: SourceField component

**Files:**
- Create: `src/panel/components/SourceField.tsx`
- Modify: `src/panel/styles.ts` (add field styles)

- [ ] **Step 1: Add field styles**

Append to `src/panel/styles.ts`:
```typescript
S.fieldRow = { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 };
S.label = { fontSize: 13, color: "#555", width: 280, flexShrink: 0 };
S.select = { padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 13, minWidth: 220 };
S.input = { padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 13, width: 220 };
```

- [ ] **Step 2: Component**

Create `src/panel/components/SourceField.tsx`:
```typescript
import React, { useEffect, useState } from "react";
import { S } from "../styles";

interface Props {
	path: string;
	value: string;
	onChange: (next: string) => void;
	sourcesFor: (path: string) => string[];
	ensureLoaded: (path: string) => Promise<void>;
}

export default function SourceField({ path, value, onChange, sourcesFor, ensureLoaded }: Props): JSX.Element {
	const [touched, setTouched] = useState(false);
	useEffect(() => {
		if (touched) void ensureLoaded(path);
	}, [path, touched, ensureLoaded]);
	const sources = sourcesFor(path);
	const showDropdown = touched && sources.length > 0;

	return (
		<div style={S.fieldRow}>
			<span style={S.label}>Source for {path}</span>
			{showDropdown ? (
				<select
					style={S.select}
					value={value}
					onChange={(e) => onChange(e.target.value)}
				>
					<option value="">(any)</option>
					{sources.map((s) => (
						<option key={s} value={s}>{s}</option>
					))}
				</select>
			) : (
				<input
					style={S.input}
					type="text"
					value={value}
					placeholder="any source"
					onChange={(e) => onChange(e.target.value)}
					onFocus={() => setTouched(true)}
				/>
			)}
		</div>
	);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/panel/styles.ts src/panel/components/SourceField.tsx
git commit -m "feat(panel): SourceField with on-focus discovery"
```

### Task 24: ConversionCard

**Files:**
- Create: `src/panel/components/ConversionCard.tsx`
- Modify: `src/panel/styles.ts` (card styles)

- [ ] **Step 1: Card styles**

Append to `src/panel/styles.ts`:
```typescript
S.card = { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "12px 16px", marginBottom: 10 };
S.cardHeader = { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 };
S.cardTitle = { fontSize: 14, fontWeight: 600, flex: 1 };
S.checkbox = { width: 16, height: 16 };
S.cardMeta = { fontSize: 11, color: "#888" };
```

- [ ] **Step 2: Component**

Create `src/panel/components/ConversionCard.tsx`:
```typescript
import React from "react";
import type { ConversionConfig } from "../../config/schema";
import type { ConversionMetadata, PerConversionStatus } from "../../api/types";
import { S } from "../styles";
import SourceField from "./SourceField";
import ExtrasEditor from "./ExtrasEditor";

interface Props {
	meta: ConversionMetadata;
	config: ConversionConfig | undefined;
	status: PerConversionStatus | undefined;
	onChange: (next: ConversionConfig) => void;
	sourcesFor: (p: string) => string[];
	ensureLoaded: (p: string) => Promise<void>;
}

const EMPTY_CFG: ConversionConfig = { enabled: false, resend: 0, sources: {}, extras: {} };

export default function ConversionCard(props: Props): JSX.Element {
	const cfg = props.config ?? EMPTY_CFG;
	const update = (patch: Partial<ConversionConfig>): void => props.onChange({ ...cfg, ...patch });

	return (
		<div style={S.card}>
			<div style={S.cardHeader}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.enabled}
					onChange={(e) => update({ enabled: e.target.checked })}
					aria-label={`Enable ${props.meta.title}`}
				/>
				<span style={S.cardTitle}>{props.meta.title}</span>
				{props.status?.emitCount ? (
					<span style={S.cardMeta}>{props.status.emitCount} emits</span>
				) : null}
				{props.status?.lastErrorMessage ? (
					<span title={props.status.lastErrorMessage} style={{ color: "#ef4444", fontSize: 12 }}>!</span>
				) : null}
			</div>
			{cfg.enabled ? (
				<>
					<div style={S.fieldRow}>
						<span style={S.label}>Resend (seconds, 0 = global)</span>
						<input
							type="number"
							min={0}
							style={S.input}
							value={cfg.resend}
							onChange={(e) => update({ resend: Math.max(0, Number(e.target.value) | 0) })}
						/>
					</div>
					{props.meta.paths.map((p) => (
						<SourceField
							key={p}
							path={p}
							value={cfg.sources?.[p] ?? ""}
							onChange={(s) => update({ sources: { ...(cfg.sources ?? {}), [p]: s } })}
							sourcesFor={props.sourcesFor}
							ensureLoaded={props.ensureLoaded}
						/>
					))}
					<ExtrasEditor
						meta={props.meta.extras}
						value={cfg.extras ?? {}}
						onChange={(e) => update({ extras: e })}
					/>
				</>
			) : null}
		</div>
	);
}
```

- [ ] **Step 3: Stub ExtrasEditor (filled in Milestone 6)**

Create `src/panel/components/ExtrasEditor.tsx`:
```typescript
import React from "react";
import type { ExtrasMeta } from "../../api/types";

interface Props {
	meta: ExtrasMeta;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function ExtrasEditor({ meta }: Props): JSX.Element | null {
	if (meta.type === "none") return null;
	return (
		<div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
			[{meta.type} editor coming in Milestone 6]
		</div>
	);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/panel/components/ src/panel/styles.ts
git commit -m "feat(panel): ConversionCard + ExtrasEditor stub"
```

### Task 25: CategoryTabs + GlobalSettings + FooterBar + wire-up

**Files:**
- Create: `src/panel/components/CategoryTabs.tsx`
- Create: `src/panel/components/GlobalSettings.tsx`
- Create: `src/panel/components/FooterBar.tsx`
- Modify: `src/panel/PluginConfigurationPanel.tsx`
- Modify: `src/panel/styles.ts`

- [ ] **Step 1: Tab styles**

Append:
```typescript
S.tabs = { display: "flex", gap: 4, borderBottom: "1px solid #e0e0e0", marginBottom: 12 };
S.tab = { padding: "8px 14px", background: "transparent", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", fontSize: 13, color: "#555" };
S.tabActive = { borderBottom: "2px solid #3b82f6", color: "#3b82f6", fontWeight: 600 };
S.footer = { display: "flex", gap: 8, padding: "12px 0", borderTop: "1px solid #e0e0e0", marginTop: 16 };
S.btnPrimary = { padding: "8px 16px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" };
S.btnSecondary = { padding: "8px 16px", background: "#f3f4f6", color: "#333", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" };
S.dirty = { color: "#92400e", fontSize: 12, marginLeft: 8 };
```

- [ ] **Step 2: CategoryTabs**

Create `src/panel/components/CategoryTabs.tsx`:
```typescript
import React from "react";
import type { ConversionCategory } from "../../config/schema";
import { Categories } from "../../config/schema";
import { S } from "../styles";

const LABELS: Record<ConversionCategory, string> = {
	navigation: "Navigation",
	engine: "Engine",
	electrical: "Electrical",
	tanks: "Tanks",
	environment: "Environment",
	ais: "AIS",
	comms: "Comms",
	system: "System",
};

interface Props {
	active: ConversionCategory;
	onChange: (next: ConversionCategory) => void;
	countsByCategory: Record<ConversionCategory, number>;
}

export default function CategoryTabs({ active, onChange, countsByCategory }: Props): JSX.Element {
	return (
		<div style={S.tabs}>
			{Categories.map((c) => (
				<button
					key={c}
					style={{ ...S.tab, ...(active === c ? S.tabActive : {}) }}
					onClick={() => onChange(c)}
					type="button"
				>
					{LABELS[c]} <span style={{ color: "#999" }}>({countsByCategory[c] ?? 0})</span>
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 3: GlobalSettings**

Create `src/panel/components/GlobalSettings.tsx`:
```typescript
import React from "react";
import { S } from "../styles";

interface Props {
	value: number;
	onChange: (next: number) => void;
}

export default function GlobalSettings({ value, onChange }: Props): JSX.Element {
	return (
		<div style={{ ...S.card, marginBottom: 16 }}>
			<div style={S.fieldRow}>
				<span style={S.label}>Global Resend Interval (seconds)</span>
				<input
					type="number"
					min={0}
					style={S.input}
					value={value}
					onChange={(e) => onChange(Math.max(0, Number(e.target.value) | 0))}
				/>
			</div>
		</div>
	);
}
```

- [ ] **Step 4: FooterBar**

Create `src/panel/components/FooterBar.tsx`:
```typescript
import React from "react";
import { S } from "../styles";

interface Props {
	dirty: boolean;
	onSave: () => void;
	onDiscard: () => void;
}

export default function FooterBar({ dirty, onSave, onDiscard }: Props): JSX.Element {
	return (
		<div style={S.footer}>
			<button type="button" style={S.btnPrimary} onClick={onSave} disabled={!dirty}>
				Save
			</button>
			<button type="button" style={S.btnSecondary} onClick={onDiscard} disabled={!dirty}>
				Discard
			</button>
			{dirty ? <span style={S.dirty}>Unsaved changes</span> : null}
		</div>
	);
}
```

- [ ] **Step 5: Wire it all together**

Replace `src/panel/PluginConfigurationPanel.tsx`:
```typescript
import React, { useEffect, useMemo, useState } from "react";
import type { ConversionMetadata, ConversionsResponse } from "../api/types";
import type { ConversionCategory } from "../config/schema";
import { Categories } from "../config/schema";
import CategoryTabs from "./components/CategoryTabs";
import ConversionCard from "./components/ConversionCard";
import FooterBar from "./components/FooterBar";
import GlobalSettings from "./components/GlobalSettings";
import StatusDashboard from "./components/StatusDashboard";
import { useConfig } from "./hooks/useConfig";
import { useSources } from "./hooks/useSources";
import { useStatus } from "./hooks/useStatus";
import { S } from "./styles";

interface Props {
	configuration: unknown;
	save: (configuration: unknown) => void;
}

export default function PluginConfigurationPanel({ configuration, save }: Props): JSX.Element {
	const { status } = useStatus();
	const { state, dispatch } = useConfig(configuration);
	const { sourcesFor, ensureLoaded } = useSources();
	const [meta, setMeta] = useState<ConversionMetadata[]>([]);
	const [tab, setTab] = useState<ConversionCategory>("navigation");
	const [initial] = useState<unknown>(configuration);

	useEffect(() => {
		fetch("/plugins/signalk-nmea2000-emitter-cannon/api/conversions", { credentials: "same-origin" })
			.then((r) => r.json() as Promise<ConversionsResponse>)
			.then((d) => setMeta(d.conversions))
			.catch(() => {});
	}, []);

	const dirty = useMemo(
		() => JSON.stringify(state) !== JSON.stringify(initial),
		[state, initial],
	);

	const visible = meta.filter((m) => m.category === tab);
	const counts = useMemo(() => {
		const c = {} as Record<ConversionCategory, number>;
		for (const cat of Categories) c[cat] = 0;
		for (const m of meta) c[m.category]++;
		return c;
	}, [meta]);
	const statusByKey = useMemo(() => {
		const m = new Map<string, NonNullable<typeof status>["perConversion"][number]>();
		if (status) for (const r of status.perConversion) m.set(r.key, r);
		return m;
	}, [status]);

	return (
		<div style={S.root}>
			<StatusDashboard status={status} />
			<GlobalSettings
				value={state.globalResendInterval}
				onChange={(ms) => dispatch({ type: "setGlobalResend", ms })}
			/>
			<CategoryTabs active={tab} onChange={setTab} countsByCategory={counts} />
			{visible.map((m) => (
				<ConversionCard
					key={m.key}
					meta={m}
					config={state.conversions[m.key]}
					status={statusByKey.get(m.key)}
					sourcesFor={sourcesFor}
					ensureLoaded={ensureLoaded}
					onSetEnabled={(e) => dispatch({ type: "setEnabled", key: m.key, enabled: e })}
					onSetResend={(ms) => dispatch({ type: "setResend", key: m.key, ms })}
					onSetSource={(path, source) => dispatch({ type: "setSource", key: m.key, path, source })}
					onSetExtras={(extras) => dispatch({ type: "setExtras", key: m.key, extras })}
				/>
			))}
			<FooterBar
				dirty={dirty}
				onSave={() => save(state)}
				onDiscard={() => dispatch({ type: "discard", config: initial as never })}
			/>
		</div>
	);
}
```

**Required: update `ConversionCard.tsx` to use per-field callbacks instead of the single `onChange` it currently has.** The reducer is per-field, so the card emits per-field events. Replace the card's prop interface and body:

```typescript
interface Props {
	meta: ConversionMetadata;
	config: ConversionConfig | undefined;
	status: PerConversionStatus | undefined;
	onSetEnabled: (next: boolean) => void;
	onSetResend: (ms: number) => void;
	onSetSource: (path: string, source: string) => void;
	onSetExtras: (extras: Record<string, unknown>) => void;
	sourcesFor: (p: string) => string[];
	ensureLoaded: (p: string) => Promise<void>;
}
```

Inside the body, call `props.onSetEnabled(e.target.checked)`, `props.onSetResend(...)`, `props.onSetSource(p, s)`, `props.onSetExtras(e)` instead of the previous `update({...})` calls.

- [ ] **Step 6: Build, restart, smoke**

`npm run build && sudo systemctl restart signalk`. Panel should show: status bar, global resend, 8 tabs with counts, cards under the active tab with enable / resend / source dropdowns. Save button stays disabled until something changes; clicking Save invokes `save(state)`.

- [ ] **Step 7: Commit**

```bash
git add src/panel/
git commit -m "feat(panel): category tabs, conversion cards, global settings, save flow"
```

- [ ] **Step 8: Tag**

```bash
git tag -a milestone5-cards -m "Milestone 5 complete: conversion cards usable"
```

---

## Milestone 6: Extras editors

Goal: per-family mapping UIs (battery / engine / tank / solar / brightness / exhaust) plus `field` editor variant.

### Task 26: Shared MappingTable building block

**Files:**
- Create: `src/panel/components/extras/MappingTable.tsx`

- [ ] **Step 1: Write it**

Create `src/panel/components/extras/MappingTable.tsx`:
```typescript
import React from "react";
import { S } from "../../styles";

interface Column<T> {
	header: string;
	render: (row: T, onChange: (next: T) => void, available: string[]) => JSX.Element;
}

interface Props<T> {
	title: string;
	rows: T[];
	emptyRow: () => T;
	columns: Column<T>[];
	available?: string[];
	onChange: (next: T[]) => void;
}

export default function MappingTable<T>(props: Props<T>): JSX.Element {
	return (
		<div style={{ marginTop: 8 }}>
			<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{props.title}</div>
			<table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
				<thead>
					<tr style={{ textAlign: "left", color: "#666" }}>
						{props.columns.map((c) => (
							<th key={c.header} style={{ padding: 6, fontWeight: 500 }}>{c.header}</th>
						))}
						<th />
					</tr>
				</thead>
				<tbody>
					{props.rows.map((row, i) => (
						<tr key={i}>
							{props.columns.map((c) => (
								<td key={c.header} style={{ padding: 6 }}>
									{c.render(row, (next) => {
										const out = props.rows.slice();
										out[i] = next;
										props.onChange(out);
									}, props.available ?? [])}
								</td>
							))}
							<td>
								<button
									type="button"
									style={S.btnSecondary}
									onClick={() => props.onChange(props.rows.filter((_, j) => j !== i))}
								>
									Remove
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<button
				type="button"
				style={{ ...S.btnSecondary, marginTop: 6 }}
				onClick={() => props.onChange([...props.rows, props.emptyRow()])}
			>
				+ Add row
			</button>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panel/components/extras/MappingTable.tsx
git commit -m "feat(panel): MappingTable building block for extras editors"
```

### Task 27: BatteryMappingEditor

**Files:**
- Create: `src/panel/components/extras/BatteryMappingEditor.tsx`

- [ ] **Step 1: Write it**

Create `src/panel/components/extras/BatteryMappingEditor.tsx`:
```typescript
import React from "react";
import { S } from "../../styles";
import MappingTable from "./MappingTable";

interface Row { signalkId: string; instanceId: number }

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function BatteryMappingEditor({ value, onChange }: Props): JSX.Element {
	const rows: Row[] = Array.isArray(value.batteries) ? (value.batteries as Row[]) : [];
	const setRows = (next: Row[]): void => onChange({ ...value, batteries: next });
	return (
		<MappingTable<Row>
			title="Battery Mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				{
					header: "Signal K battery id",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.signalkId}
							placeholder="house, starter, 0"
							onChange={(e) => set({ ...r, signalkId: e.target.value })}
						/>
					),
				},
				{
					header: "NMEA 2000 Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.instanceId}
							onChange={(e) => set({ ...r, instanceId: Number(e.target.value) | 0 })}
						/>
					),
				},
			]}
		/>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panel/components/extras/BatteryMappingEditor.tsx
git commit -m "feat(panel): BatteryMappingEditor"
```

### Tasks 28-32: Engine / Tank / Solar / Brightness / Exhaust editors

**Files:**
- Create: `src/panel/components/extras/EngineMappingEditor.tsx`
- Create: `src/panel/components/extras/TankMappingEditor.tsx`
- Create: `src/panel/components/extras/SolarMappingEditor.tsx`
- Create: `src/panel/components/extras/BrightnessMappingEditor.tsx`
- Create: `src/panel/components/extras/ExhaustMappingEditor.tsx`

Each editor follows the BatteryMappingEditor pattern. The differences are which extras key holds the rows and which row shape is used.

- [ ] **Step 1: EngineMappingEditor**

Same as Battery but `value.engines`, columns `signalkId` (placeholder "main, port, starboard") and `instanceId`. Commit: `feat(panel): EngineMappingEditor`.

- [ ] **Step 2: TankMappingEditor**

`value.tanks`. Row shape `{ signalkPath: string; instanceId: number }`. Columns: "Signal K tank path" (placeholder "tanks.fuel.0"), "NMEA 2000 Instance Id". Commit: `feat(panel): TankMappingEditor`.

- [ ] **Step 3: SolarMappingEditor**

`value.chargers`. Row shape `{ signalkId: string; instanceId: number; panelInstanceId: number }`. Three numeric/text columns. Commit: `feat(panel): SolarMappingEditor`.

- [ ] **Step 4: BrightnessMappingEditor**

`value.groups`. Row shape `{ signalkId: string; instanceId: string }` (instance is a label like "Helm 1"). Two text columns. Commit: `feat(panel): BrightnessMappingEditor`.

- [ ] **Step 5: ExhaustMappingEditor**

`value.engines`. Row shape `{ signalkId: string; tempInstanceId: number }`. Two columns. Commit: `feat(panel): ExhaustMappingEditor`.

### Task 33: FieldEditor and discriminator wire-up

**Files:**
- Create: `src/panel/components/extras/FieldEditor.tsx`
- Modify: `src/panel/components/ExtrasEditor.tsx`

- [ ] **Step 1: FieldEditor**

Create `src/panel/components/extras/FieldEditor.tsx`:
```typescript
import React from "react";
import type { ExtrasMeta } from "../../../api/types";
import { S } from "../../styles";

interface Props {
	meta: Extract<ExtrasMeta, { type: "field" }>;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function FieldEditor({ meta, value, onChange }: Props): JSX.Element {
	const v = value[meta.key] ?? meta.default ?? "";
	const update = (next: unknown): void => onChange({ ...value, [meta.key]: next });
	return (
		<div style={S.fieldRow}>
			<span style={S.label}>{meta.label}</span>
			{meta.control === "boolean" ? (
				<input type="checkbox" style={S.checkbox} checked={Boolean(v)} onChange={(e) => update(e.target.checked)} />
			) : meta.control === "number" ? (
				<input type="number" style={S.input} value={Number(v) || 0} onChange={(e) => update(Number(e.target.value))} />
			) : (
				<input type="text" style={S.input} value={String(v)} onChange={(e) => update(e.target.value)} />
			)}
		</div>
	);
}
```

- [ ] **Step 2: ExtrasEditor discriminator**

Replace `src/panel/components/ExtrasEditor.tsx`:
```typescript
import React from "react";
import type { ExtrasMeta } from "../../api/types";
import BatteryMappingEditor from "./extras/BatteryMappingEditor";
import EngineMappingEditor from "./extras/EngineMappingEditor";
import TankMappingEditor from "./extras/TankMappingEditor";
import SolarMappingEditor from "./extras/SolarMappingEditor";
import BrightnessMappingEditor from "./extras/BrightnessMappingEditor";
import ExhaustMappingEditor from "./extras/ExhaustMappingEditor";
import FieldEditor from "./extras/FieldEditor";

interface Props {
	meta: ExtrasMeta;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function ExtrasEditor({ meta, value, onChange }: Props): JSX.Element | null {
	switch (meta.type) {
		case "none": return null;
		case "batteryMapping": return <BatteryMappingEditor value={value} onChange={onChange} />;
		case "engineMapping": return <EngineMappingEditor value={value} onChange={onChange} />;
		case "tankMapping": return <TankMappingEditor value={value} onChange={onChange} />;
		case "solarMapping": return <SolarMappingEditor value={value} onChange={onChange} />;
		case "brightnessMapping": return <BrightnessMappingEditor value={value} onChange={onChange} />;
		case "exhaustMapping": return <ExhaustMappingEditor value={value} onChange={onChange} />;
		case "field": return <FieldEditor meta={meta} value={value} onChange={onChange} />;
	}
}
```

- [ ] **Step 3: Build, smoke**

`npm run build && sudo systemctl restart signalk`. Open Battery, Engine, Tank, Solar, Brightness, Exhaust cards: each shows a mapping table with add/remove rows. Notifications card shows the Exclude Paths text input. Temperature_* cards show the instance number input.

- [ ] **Step 4: Commit + tag**

```bash
git add src/panel/components/
git commit -m "feat(panel): full extras editor set (battery/engine/tank/solar/brightness/exhaust/field)"
git tag -a milestone6-extras -m "Milestone 6 complete: extras editors"
```

---

## Milestone 7: Preset chips

### Task 34: PresetChips component

**Files:**
- Create: `src/panel/components/PresetChips.tsx`
- Modify: `src/panel/PluginConfigurationPanel.tsx`
- Modify: `src/panel/styles.ts`

- [ ] **Step 1: Chip styles**

Append:
```typescript
S.chipRow = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 };
S.chip = { padding: "6px 12px", background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer" };
```

- [ ] **Step 2: PresetChips**

Create `src/panel/components/PresetChips.tsx`:
```typescript
import React from "react";
import { PresetTags, type PresetTag } from "../../config/schema";
import { S } from "../styles";

const LABELS: Record<PresetTag, string> = {
	"basic-nav": "Basic Navigation",
	"engine-set": "Engine Set",
	"full-ais": "Full AIS",
	"environmental": "Environmental",
	"raymarine": "Raymarine",
};

interface Props {
	onApply: (p: PresetTag) => void;
}

export default function PresetChips({ onApply }: Props): JSX.Element {
	return (
		<div style={S.chipRow}>
			{PresetTags.map((p) => (
				<button key={p} type="button" style={S.chip} onClick={() => onApply(p)}>
					+ {LABELS[p]}
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 3: Wire into PluginConfigurationPanel**

In `PluginConfigurationPanel.tsx`, immediately under `<StatusDashboard ... />` add:
```tsx
<PresetChips onApply={(p) => dispatch({ type: "applyPreset", preset: p, meta })} />
```

- [ ] **Step 4: Build, smoke**

`npm run build && sudo systemctl restart signalk`. Five chips appear under the status bar. Clicking "Basic Navigation" flips on WIND, DEPTH, COG_SOG, HEADING, SPEED, RUDDER, GPS, TRUE_HEADING and leaves the rest alone.

- [ ] **Step 5: Commit + tag**

```bash
git add src/panel/
git commit -m "feat(panel): preset chips (additive enable for tagged conversions)"
git tag -a milestone7-presets -m "Milestone 7 complete: presets"
```

---

## Milestone 8: Documentation, version bump, release prep

### Task 35: README rewrite

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

Replace the configuration section with a description of the federated panel. Add:
- Minimum admin UI requirement: `@signalk/server-admin-ui >= 2.27.0` (ships with signalk-server >= 2.x).
- Migration note: existing installs are migrated transparently on first start; no manual action.
- Brief tour of the panel sections (status, presets, categorized tabs).
- Screenshots are optional for v1.5.3 release. If skipping, omit the screenshots section entirely from the README. Do NOT write placeholder text like "Screenshots coming soon"; either include a real screenshot or omit the section.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): describe React config panel and v1.5.3 admin UI requirement"
```

### Task 36: CHANGELOG entry

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add v1.5.3 section**

Prepend to `CHANGELOG.md`:
```markdown
## v1.5.3

### Breaking

- Admin config UI now loads via webpack 5 Module Federation. Requires `@signalk/server-admin-ui >= 2.27.0` (bundled with signalk-server >= 2.x).
- Config payload shape changed. Existing configs are migrated at first start. Downgrading to v1.x preserves the original `plugin-config.json` if no save was performed under v2.

### Added

- React config panel with categorized tabs (Navigation, Engine, Electrical, Tanks, Environment, AIS, Comms, System).
- Live status dashboard: NMEA 2000 readiness, enabled count, per-conversion emit counts and error indicators (3s poll, paused when admin tab is hidden).
- Live source dropdowns populated from the running server (`/sources` tree walk).
- Mapping editors for battery, engine, tank, solar, brightness, and exhaust.
- Preset chips: Basic Navigation, Engine Set, Full AIS, Environmental, Raymarine.
- Plugin HTTP API under `/plugins/signalk-nmea2000-emitter-cannon/api/` (status, conversions, paths, sources). Admin-auth gated.

### Internal

- Config schema moved to `@sinclair/typebox` for single-source-of-truth between TypeScript types and JSON Schema.
- 8-category metadata added to every conversion module.
- New per-conversion emit-count and last-error tracking in `PluginManager`.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): v1.5.3 entry"
```

### Task 37: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add an "Admin UI" section to CLAUDE.md**

After the Workflow rules section, add:
```markdown
## Admin UI: federated React panel

The plugin's admin config UI is a webpack 5 Module Federation remote built into `public/remoteEntry.js` from `src/panel/`. The Signal K admin loads it because `package.json` keywords include `signalk-plugin-configurator`. Component contract: default export `PluginConfigurationPanel({ configuration, save })`; `save` is fire-and-forget, returns void.

Live data comes from an Express router mounted via `Plugin.registerWithRouter` under `/plugins/signalk-nmea2000-emitter-cannon/api/` (status, conversions, paths, sources). The router calls `app.securityStrategy.addAdminMiddleware` on the API prefix; `registerWithRouter` callback ordering means this is fine but it is worth verifying with a curl smoke test against an unauthenticated GET when changing the router.

Config shape is defined in TypeBox (`src/config/schema.ts`). `Plugin.schema` returns the TypeBox object directly, which IS a valid JSON Schema literal at runtime. Adding a new conversion requires:
1. Create the module in `src/conversions/`, including `category` and optional `presets`.
2. Add to the registry in `src/conversions/index.ts`.
3. If the conversion has extras, add an `ExtrasMeta` entry in `src/api/extras-meta.ts`.
4. Add the panel-side mapping editor in `src/panel/components/extras/` if needed (otherwise the discriminator falls through to `none` or `field`).
5. Test as usual.

Minimum admin UI: `@signalk/server-admin-ui >= 2.27.0`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document the federated React panel architecture"
```

### Task 38: Bump version, prepare release commit (local only)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

```bash
npm version --no-git-tag-version 1.5.3
```

- [ ] **Step 2: Full build + test pass**

```bash
npm run clean && npm run build && npm test && npm run typecheck && npm run check
```
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "release: v1.5.3 React config panel"
git tag -a v1.5.3 -m "v1.5.3 React config panel (local only, not pushed)"
```

- [ ] **Step 4: STOP**

Do NOT run `git push`, `git push --tags`, `npm publish`, or `npm run release`. Per the workflow rule in CLAUDE.md and the corresponding feedback memory, wait for the user's explicit go-ahead.

Final state to report: "v1.5.3 staged locally as tag v1.5.3. No push performed. Waiting for ok to push."

---

## Self-review notes

- All 14 spec sections are covered: schema (Tasks 1, 2, 5, 6), conversion metadata (Tasks 3, 4, 10), API router with auth (Tasks 8-13), federation skeleton (Tasks 15-18), status dashboard (Tasks 19-20), conversion cards and save flow (Tasks 21-25), extras editors (Tasks 26-33), presets (Task 34), docs and release (Tasks 35-38). Migration is in Task 5 and exercised in the panel via `useConfig` (Task 21).
- Live smoke checkpoints occur after Milestones 1, 2, 3, 4, 5, 6, 7. The user has authorized signalk restarts.
- Push gate is restated in Task 38 final step.
- No placeholders: every code step has actual code; every command step has actual commands and expected output.
