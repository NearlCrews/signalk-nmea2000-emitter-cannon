# Advisor Settings Sub-Panel Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Expose the `advisor` config block (master toggle, OpenRouter, QuestDB, schedule) as themed, tooltip-documented controls in the Config Advisor panel section.

**Architecture:** The `advisor` block already exists in the TypeBox schema. This adds a `setAdvisor` reducer action, a `DEFAULT_ADVISOR_CONFIG` panel-safe constant, an `AdvisorSettings` form component, and wires `AdvisorPanel` to the panel's existing `useConfig` state. Edits persist through the panel's normal Save button (the `/config` POST path that correctly restarts the plugin); the advisor never writes these settings itself, so there is no restart race.

**Tech Stack:** React 19 federated panel, TypeBox config, Vitest.

**Scope note:** This is the settings UI only. The OpenRouter, QuestDB, and scheduling engines that consume these settings are Phases 2-4 of the design spec. The controls persist their values now; the engines read them when each phase lands.

---

## File Structure

- Modify: `src/config/enums.ts` — add `DEFAULT_ADVISOR_CONFIG` (panel-safe plain object).
- Modify: `src/panel/hooks/useConfig.ts` — add the `setAdvisor` action and reducer case.
- Create: `src/panel/components/advisor/AdvisorSettings.tsx` — the settings form.
- Modify: `src/panel/components/advisor/AdvisorPanel.tsx` — accept `advisor` + `onChangeAdvisor` props, render `AdvisorSettings`.
- Modify: `src/panel/PluginConfigurationPanel.tsx` — pass `state.advisor` and a `setAdvisor` dispatch callback to `AdvisorPanel`.
- Modify: `src/panel/styles.ts` — add a section-subheading style.
- Test: `src/test/advisor-config.test.ts` — assert `DEFAULT_ADVISOR_CONFIG` matches the schema defaults; `src/test/useConfig` coverage for `setAdvisor` is added inline in a new `src/test/useConfig.test.ts`.

---

## Task 1: Panel-safe advisor defaults

**Files:**
- Modify: `src/config/enums.ts`
- Test: `src/test/advisor-config.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/test/advisor-config.test.ts`:

```typescript
import { Value } from "@sinclair/typebox/value";
import { DEFAULT_ADVISOR_CONFIG } from "../config/enums.js";

describe("DEFAULT_ADVISOR_CONFIG", () => {
	it("matches the schema-materialized advisor defaults", () => {
		const filled = Value.Default(RootConfig, { conversions: {} }) as {
			advisor: unknown;
		};
		expect(DEFAULT_ADVISOR_CONFIG).toEqual(filled.advisor);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/advisor-config.test.ts -t "DEFAULT_ADVISOR_CONFIG"`
Expected: FAIL (cannot find `DEFAULT_ADVISOR_CONFIG`).

- [ ] **Step 3: Add the constant**

Append to `src/config/enums.ts`:

```typescript
// Plain-object mirror of the AdvisorConfig schema defaults. The panel bundle
// must not import @sinclair/typebox, so the panel uses this instead of
// materializing defaults from the schema. A test in advisor-config.test.ts
// asserts this stays in lockstep with the schema.
export const DEFAULT_ADVISOR_CONFIG = {
	enabled: false,
	openRouter: {
		enabled: false,
		apiKey: "",
		model: "anthropic/claude-haiku-4.5",
		maxCallsPerDay: 25,
	},
	questdb: { enabled: false, url: "http://localhost:9000", lookbackDays: 7 },
	schedule: { periodic: false, intervalDays: 7 },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/advisor-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/enums.ts src/test/advisor-config.test.ts
git commit -m "feat(advisor): add panel-safe DEFAULT_ADVISOR_CONFIG"
```

---

## Task 2: setAdvisor reducer action

**Files:**
- Modify: `src/panel/hooks/useConfig.ts`
- Test: `src/test/useConfig.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/test/useConfig.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { DEFAULT_ADVISOR_CONFIG } from "../config/enums.js";
import { __advisorReducerForTest } from "../panel/hooks/useConfig.js";

describe("setAdvisor reducer action", () => {
	it("replaces the advisor block", () => {
		const start = { globalResendInterval: 0, conversions: {} };
		const next = __advisorReducerForTest(start, {
			...DEFAULT_ADVISOR_CONFIG,
			enabled: true,
		});
		expect(next.advisor?.enabled).toBe(true);
		expect(next.conversions).toBe(start.conversions);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/useConfig.test.ts`
Expected: FAIL (`__advisorReducerForTest` not exported).

- [ ] **Step 3: Add the action and reducer case**

In `src/panel/hooks/useConfig.ts`, add to the `Action` union:

```typescript
	| { type: "setAdvisor"; advisor: Config["advisor"] }
```

Add this case to the `reducer` switch (before the closing brace of `switch`):

```typescript
		case "setAdvisor":
			return { ...state, advisor: action.advisor };
```

At the end of the file, add a thin test seam:

```typescript
// Test-only: exercises the setAdvisor reducer case without a React render.
export function __advisorReducerForTest(
	state: Config,
	advisor: Config["advisor"],
): Config {
	return reducer(state, { type: "setAdvisor", advisor });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/useConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/panel/hooks/useConfig.ts src/test/useConfig.test.ts
git commit -m "feat(advisor): add setAdvisor reducer action"
```

---

## Task 3: Settings subheading style

**Files:**
- Modify: `src/panel/styles.ts`

- [ ] **Step 1: Add the style**

Append to `src/panel/styles.ts`:

```typescript
S.advisorSubhead = {
	fontSize: 13,
	fontWeight: 600,
	color: "#333",
	margin: "12px 0 4px",
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/panel/styles.ts
git commit -m "feat(advisor): add settings subheading style"
```

---

## Task 4: AdvisorSettings form component

**Files:**
- Create: `src/panel/components/advisor/AdvisorSettings.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type * as React from "react";
import { DEFAULT_ADVISOR_CONFIG } from "../../../config/enums.js";
import type { Config } from "../../../config/schema.js";
import { S } from "../../styles";

type AdvisorCfg = NonNullable<Config["advisor"]>;

interface Props {
	value: Config["advisor"];
	onChange: (next: AdvisorCfg) => void;
}

/**
 * The advisor settings form: master toggle plus OpenRouter, QuestDB, and
 * schedule sub-sections. Every row carries inline help so the user does not
 * have to guess what an option does. Values persist through the panel's
 * normal Save button.
 */
export default function AdvisorSettings({
	value,
	onChange,
}: Props): React.ReactElement {
	const cfg: AdvisorCfg = value ?? DEFAULT_ADVISOR_CONFIG;

	const patch = (part: Partial<AdvisorCfg>): void => {
		onChange({ ...cfg, ...part });
	};

	return (
		<div>
			<div style={S.fieldRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.enabled}
					onChange={(e) => patch({ enabled: e.target.checked })}
					aria-label="Enable the Config Advisor"
				/>
				<span style={S.label}>Enable the Config Advisor</span>
			</div>
			<p style={S.helpHint}>
				When enabled, the advisor can review on a schedule. The Review now
				button below always works regardless of this toggle.
			</p>

			<div style={S.advisorSubhead}>OpenRouter (optional)</div>
			<p style={S.helpHint}>
				The advisor works without OpenRouter using built-in rules. Adding an
				OpenRouter key lets it explain each recommendation in plain language
				and reason about unfamiliar paths.
			</p>
			<div style={S.fieldRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.openRouter.enabled}
					onChange={(e) =>
						patch({
							openRouter: { ...cfg.openRouter, enabled: e.target.checked },
						})
					}
					aria-label="Use OpenRouter"
				/>
				<span style={S.label}>Use OpenRouter for explanations</span>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>OpenRouter API key</span>
				<input
					type="password"
					autoComplete="off"
					style={S.input}
					value={cfg.openRouter.apiKey}
					onChange={(e) =>
						patch({
							openRouter: { ...cfg.openRouter, apiKey: e.target.value },
						})
					}
					aria-label="OpenRouter API key"
				/>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>Model</span>
				<input
					type="text"
					style={S.input}
					value={cfg.openRouter.model}
					onChange={(e) =>
						patch({ openRouter: { ...cfg.openRouter, model: e.target.value } })
					}
					aria-label="OpenRouter model"
				/>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>Max OpenRouter calls per day</span>
				<input
					type="number"
					min={0}
					style={S.input}
					value={cfg.openRouter.maxCallsPerDay}
					onChange={(e) =>
						patch({
							openRouter: {
								...cfg.openRouter,
								maxCallsPerDay: Math.max(0, Number(e.target.value) | 0),
							},
						})
					}
					aria-label="Max OpenRouter calls per day"
				/>
			</div>

			<div style={S.advisorSubhead}>QuestDB history (optional)</div>
			<p style={S.helpHint}>
				If you run QuestDB with Signal K history, the advisor can also see
				paths that are not live right now. Leave disabled if you do not run
				QuestDB.
			</p>
			<div style={S.fieldRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.questdb.enabled}
					onChange={(e) =>
						patch({ questdb: { ...cfg.questdb, enabled: e.target.checked } })
					}
					aria-label="Use QuestDB history"
				/>
				<span style={S.label}>Use QuestDB history</span>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>QuestDB REST URL</span>
				<input
					type="text"
					style={S.input}
					value={cfg.questdb.url}
					onChange={(e) =>
						patch({ questdb: { ...cfg.questdb, url: e.target.value } })
					}
					aria-label="QuestDB REST URL"
				/>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>History look-back (days)</span>
				<input
					type="number"
					min={1}
					style={S.input}
					value={cfg.questdb.lookbackDays}
					onChange={(e) =>
						patch({
							questdb: {
								...cfg.questdb,
								lookbackDays: Math.max(1, Number(e.target.value) | 0),
							},
						})
					}
					aria-label="History look-back in days"
				/>
			</div>
			<p style={S.helpHint}>
				How far into QuestDB history to search for paths that are not live
				right now. Longer catches seasonal gear; shorter is faster.
			</p>

			<div style={S.advisorSubhead}>Scheduled review</div>
			<p style={S.helpHint}>
				Re-run the review automatically on an interval. The Review now button
				always works on demand regardless of this setting.
			</p>
			<div style={S.fieldRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.schedule.periodic}
					onChange={(e) =>
						patch({
							schedule: { ...cfg.schedule, periodic: e.target.checked },
						})
					}
					aria-label="Review on a schedule"
				/>
				<span style={S.label}>Review on a schedule</span>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>Review every (days)</span>
				<input
					type="number"
					min={1}
					style={S.input}
					value={cfg.schedule.intervalDays}
					onChange={(e) =>
						patch({
							schedule: {
								...cfg.schedule,
								intervalDays: Math.max(1, Number(e.target.value) | 0),
							},
						})
					}
					aria-label="Review interval in days"
				/>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/panel/components/advisor/AdvisorSettings.tsx
git commit -m "feat(advisor): add advisor settings form component"
```

---

## Task 5: Wire AdvisorSettings into AdvisorPanel

**Files:**
- Modify: `src/panel/components/advisor/AdvisorPanel.tsx`

- [ ] **Step 1: Update AdvisorPanel**

Add the imports beside the existing ones:

```typescript
import type { Config } from "../../../config/schema.js";
import AdvisorSettings from "./AdvisorSettings.js";
```

Change the component signature to accept props:

```tsx
interface Props {
	advisor: Config["advisor"];
	onChangeAdvisor: (next: NonNullable<Config["advisor"]>) => void;
}

export default function AdvisorPanel({
	advisor,
	onChangeAdvisor,
}: Props): React.ReactElement {
```

Inside the `{open && (...)}` block, render `AdvisorSettings` directly above the existing intro paragraph:

```tsx
				<AdvisorSettings value={advisor} onChange={onChangeAdvisor} />
				<p style={S.advisorIntro}>
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: FAIL at `PluginConfigurationPanel.tsx` (AdvisorPanel now requires props). That is fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/panel/components/advisor/AdvisorPanel.tsx
git commit -m "feat(advisor): render settings form in the advisor panel"
```

---

## Task 6: Pass advisor config from PluginConfigurationPanel

**Files:**
- Modify: `src/panel/PluginConfigurationPanel.tsx`

- [ ] **Step 1: Pass the props**

In `src/panel/PluginConfigurationPanel.tsx`, replace the `<AdvisorPanel />` element with:

```tsx
			<AdvisorPanel
				advisor={state.advisor}
				onChangeAdvisor={(advisor) => dispatch({ type: "setAdvisor", advisor })}
			/>
```

`state` and `dispatch` are already in scope from the `useConfig` hook used elsewhere in this component.

- [ ] **Step 2: Verify the full build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass; both builds succeed.

- [ ] **Step 3: Commit**

```bash
git add src/panel/PluginConfigurationPanel.tsx
git commit -m "feat(advisor): wire advisor settings to panel config state"
```

---

## Self-Review

- **Spec coverage:** the settings sub-panel (master toggle, OpenRouter key/model/budget, QuestDB url/lookback, schedule interval) is the spec's section 9.1, deferred from Phase 1. Every control has inline help (spec's tooltip requirement).
- **No restart race:** edits dispatch into the panel's `useConfig` state and persist via the existing Save button (`/config` POST, which restarts the plugin correctly). The advisor's own `writeConfig` path is untouched.
- **No placeholders:** every component and reducer change is given in full.
- **Type consistency:** `setAdvisor` carries `Config["advisor"]`; `AdvisorSettings` and `AdvisorPanel` use `NonNullable<Config["advisor"]>` for the non-optional callback payload; `DEFAULT_ADVISOR_CONFIG` covers the `value === undefined` case.
- **Engine scope:** the OpenRouter, QuestDB, and schedule engines are Phases 2-4; this task only persists the settings they will read.
