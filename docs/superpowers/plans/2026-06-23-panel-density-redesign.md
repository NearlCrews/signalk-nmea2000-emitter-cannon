# Config panel density redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the panel's tall boxed conversion cards and chrome stack with dense hairline rows and a compact toolbar, so a category drops from about four screens to roughly one, with no feature loss.

**Architecture:** Each conversion becomes a ~34 px `ConversionRow` inside one hairline-divided container, with its editor lifted into `ConversionDetail` and shown by a single-open accordion. The status dashboard, presets, advisor, and global settings collapse into a compact `PanelToolbar` plus three collapsed disclosures. A pure `rowStatus` helper (the only unit-testable piece) is TDD'd; the React components are gated by the TypeScript compiler, biome, the build, and live-admin verification, matching this project's existing testing pattern.

**Tech Stack:** React 19 (function components, `memo`, hooks), TypeScript strict, inline-style `S` objects plus an injected `THEME_STYLE` stylesheet for pseudo-classes and sticky and CSS custom properties, webpack 5 Module Federation, Vitest, Biome.

## Global Constraints

Every task implicitly includes these, copied from the spec:

- Tokens only. Every color and space is an existing `--skn-*` token; add NO new custom-property token. Badge dots use foreground tokens (`--skn-warn-fg` for partial, `--skn-text-muted` for ignores), not border or neutral tokens.
- Three themes: light, dark, and the red-preserving night. Never rely on hue alone, because night `--skn-ok` and `--skn-wait` are both amber. The redundant cues are the recency text (always populated for an enabled row), the rail pattern (filled versus hollow), and the readiness word.
- Single column at all widths.
- Accessibility is preserved or improved: the checkbox and disclosure-button split, `aria-expanded` and `aria-controls`, the hidden placeholder so `aria-controls` always resolves, single-open focus return, visually-hidden badge labels, the toolbar as a labelled region (not `role="toolbar"`), `role="status"` announcements with stated strings, and `jumpToFirstError` moving focus.
- All edits flow through the existing `useConfig` reducer. No new save logic. Expansion is a single `expandedKey: string | null` with a referentially stable toggle.
- House style in all UI copy, comments, and commit messages: no em dashes (use a colon, a comma, or two sentences), never the "&" character (write "and"), Oxford commas.
- Gates after every task: `npm run typecheck`, `npm run check`, `npm test`, and `npm run build` all green.
- Density definition of done: the Navigation category with the Modern section expanded fits within about two viewport heights on a 1080p display at the standard admin sidebar width, down from about four today.

---

## File structure

Create:
- `src/panel/rowStatus.ts`: pure `(status, enabled)` to `{ rail, recency }` mapping. One responsibility: derive a row's live-state label and rail state.
- `src/test/rowStatus.test.ts`: unit tests for the above.
- `src/panel/components/ConversionDetail.tsx`: the expanded editor body, lifted verbatim from `ConversionCard`.
- `src/panel/components/ConversionRow.tsx`: the dense collapsed row plus the accordion mount of `ConversionDetail`.
- `src/panel/components/PanelToolbar.tsx`: the compact toolbar (search, status chip, view toggle, theme, wizard).

Modify:
- `src/panel/styles.ts`: dense-row, hairline-container, status-rail, fixed-badge-slot, toolbar, and status-chip styles, plus injected CSS for row hover, sticky toolbar, the `--skn-toolbar-height` variable, and `scroll-margin-top`.
- `src/panel/components/Disclosure.tsx`: add an optional `headerTrailing` slot rendered as a sibling outside the toggle button.
- `src/panel/components/CollapsibleSection.tsx`: header gains Enable all and Disable all via `headerTrailing`, plus a `role="status"` announcement.
- `src/panel/PluginConfigurationPanel.tsx`: single-open `expandedKey`, `setEnabledForKeys`, `jumpToFirstError` focus, the toolbar and disclosures composition, the `panel:*` disclosure keys.

Remove:
- `src/panel/components/ConversionCard.tsx`: superseded by `ConversionRow` plus `ConversionDetail` (deleted in Task 5).
- `src/panel/components/StatusDashboard.tsx`: its rendering moves into the toolbar status chip (deleted in Task 7).

---

## Task 1: rowStatus pure helper

**Files:**
- Create: `src/panel/rowStatus.ts`
- Test: `src/test/rowStatus.test.ts`

**Interfaces:**
- Consumes: `PerConversionStatus` from `src/api/types.ts` (fields: `enabled`, `emitCount`, `lastEmitMs?`, `lastErrorMessage?`), and `humanizeAgo` from `src/panel/recency.ts`.
- Produces: `type RailState = "emitting" | "silent" | "error" | "disabled"`; `interface RowStatus { rail: RailState; recency: string | null }`; `function rowStatus(status: PerConversionStatus | undefined, enabled: boolean): RowStatus`.

- [ ] **Step 1: Write the failing test**

Create `src/test/rowStatus.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { rowStatus } from "../panel/rowStatus.js";

const base = { key: "K", emitCount: 0, enabled: false } as const;

describe("rowStatus", () => {
  it("is emitting with a count and age when emitCount > 0 and no error", () => {
    const r = rowStatus(
      { ...base, enabled: true, emitCount: 5, lastEmitMs: 1000 },
      true,
    );
    expect(r.rail).toBe("emitting");
    expect(r.recency).toMatch(/^5 emits, last /);
  });

  it("is silent with 'no recent output' when enabled but never emitted", () => {
    const r = rowStatus({ ...base, enabled: true, emitCount: 0 }, true);
    expect(r.rail).toBe("silent");
    expect(r.recency).toBe("no recent output");
  });

  it("is error (rail) when a lastErrorMessage is present, keeping the emit recency", () => {
    const r = rowStatus(
      { ...base, enabled: true, emitCount: 3, lastEmitMs: 0, lastErrorMessage: "boom" },
      true,
    );
    expect(r.rail).toBe("error");
    expect(r.recency).toMatch(/^3 emits, last /);
  });

  it("is silent with text when enabled and no status object exists yet", () => {
    const r = rowStatus(undefined, true);
    expect(r.rail).toBe("silent");
    expect(r.recency).toBe("no recent output");
  });

  it("is disabled with null recency when not enabled and not emitting", () => {
    expect(rowStatus(undefined, false)).toEqual({ rail: "disabled", recency: null });
    expect(rowStatus({ ...base, enabled: false, emitCount: 0 }, false)).toEqual({
      rail: "disabled",
      recency: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/rowStatus.test.ts`
Expected: FAIL, cannot resolve `../panel/rowStatus.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/panel/rowStatus.ts`:

```typescript
import type { PerConversionStatus } from "../api/types.js";
import { humanizeAgo } from "./recency.js";

export type RailState = "emitting" | "silent" | "error" | "disabled";

export interface RowStatus {
  /** Drives the left rail treatment. */
  rail: RailState;
  /** Right-aligned recency text; null when nothing should show (disabled). */
  recency: string | null;
}

/**
 * Derive a conversion row's live-state rail and recency text. Error takes
 * precedence on the rail (it is the most important signal) while the recency
 * text still reports the emit count, so an erroring-yet-emitting conversion
 * reads as both. An enabled conversion never has a blank recency: a quiet one
 * reads "no recent output", which is the load-bearing emitting-versus-silent
 * cue in the night theme where the rail hue cannot carry it.
 */
export function rowStatus(
  status: PerConversionStatus | undefined,
  enabled: boolean,
): RowStatus {
  const rail: RailState = status?.lastErrorMessage
    ? "error"
    : status && status.emitCount > 0
      ? "emitting"
      : enabled
        ? "silent"
        : "disabled";
  let recency: string | null = null;
  if (status && status.emitCount > 0) {
    recency = `${status.emitCount} emits, last ${humanizeAgo(status.lastEmitMs)}`;
  } else if (enabled) {
    recency = "no recent output";
  }
  return { rail, recency };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/rowStatus.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck && npm run check`
Expected: both green.

```bash
git add src/panel/rowStatus.ts src/test/rowStatus.test.ts
git commit -m "feat(panel): add rowStatus helper for dense-row live state"
```

---

## Task 2: styles for the dense row, rail, toolbar, and injected CSS

**Files:**
- Modify: `src/panel/styles.ts`

**Interfaces:**
- Produces (new `S.*` keys, all built from existing `--skn-*` tokens): `S.rowList` (the hairline container), `S.row`, `S.rowRail` plus `S.rowRailEmitting`, `S.rowRailSilent`, `S.rowRailError`, `S.rowRailDisabled`, `S.rowMain`, `S.rowTitleWrap`, `S.rowPgn`, `S.rowBadgeSlot`, `S.rowRecency`, `S.toolbar`, `S.toolbarRegion`, `S.statusChip`, `S.bulkBtn`, `S.disclosureHeaderRow`. Plus three appended `THEME_STYLE` rules: `.skn-row:hover`, `.skn-toolbar` sticky with `--skn-toolbar-height`, and `.skn-row { scroll-margin-top }`.
- Consumes: existing tokens `--skn-ok`, `--skn-wait`, `--skn-danger-fg`, `--skn-warn-fg`, `--skn-text`, `--skn-text-muted`, `--skn-text-faint`, `--skn-surface`, `--skn-surface-muted`, `--skn-border`, `--skn-space-1`, `--skn-space-2`, `--skn-radius`, `--skn-font-title`, `--skn-font-small`, and the `S.visuallyHidden`, `S.dot`, `S.errorMark` styles.

- [ ] **Step 1: Add the style objects**

In `src/panel/styles.ts`, after the existing card-style block, add (these are inline-style objects; the `S` object is the established pattern, so match the surrounding assignment syntax in the file, whether `S.key = {...}` or a literal inside the `S` object):

```typescript
// Dense conversion list: one bordered surface, hairline row dividers, no
// per-row box or gap. Replaces the boxed-card stack.
S.rowList = {
  border: "1px solid var(--skn-border)",
  borderRadius: "var(--skn-radius)",
  background: "var(--skn-surface)",
  overflow: "hidden",
};
S.row = {
  display: "flex",
  alignItems: "center",
  gap: "var(--skn-space-1)",
  padding: "4px var(--skn-space-2)",
  borderBottom: "1px solid var(--skn-border)",
  borderLeft: "3px solid transparent",
  minHeight: 34,
  cursor: "pointer",
};
// Rail treatments. Emitting is a solid rail; silent is a hollow rail (a dotted
// border-left) so emitting and silent differ by pattern, not only by a hue that
// collides in the night theme. Error uses the danger foreground; disabled has
// no rail.
S.rowRailEmitting = { borderLeftColor: "var(--skn-ok)", borderLeftStyle: "solid" };
S.rowRailSilent = { borderLeftColor: "var(--skn-wait)", borderLeftStyle: "dotted" };
S.rowRailError = { borderLeftColor: "var(--skn-danger-fg)", borderLeftStyle: "solid" };
S.rowRailDisabled = { borderLeftColor: "transparent" };
S.rowMain = { display: "flex", alignItems: "center", gap: "var(--skn-space-1)", flex: 1, minWidth: 0 };
S.rowTitleWrap = { display: "flex", alignItems: "baseline", flex: 1, minWidth: 0 };
// The title prose truncates; the PGN run never does. minWidth:0 at every flex
// level is what lets the ellipsis engage.
S.rowTitle = {
  font: "var(--skn-font-title)",
  fontWeight: 600,
  color: "var(--skn-text)",
  flex: "0 1 auto",
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
S.rowPgn = { color: "var(--skn-text-muted)", whiteSpace: "nowrap", flex: "0 0 auto" };
// Fixed-width reserved slot so a badge-less row does not shift the recency column.
S.rowBadgeSlot = { width: 16, flexShrink: 0, textAlign: "center", display: "inline-flex", justifyContent: "center" };
S.rowRecency = {
  marginLeft: "auto",
  color: "var(--skn-text-faint)",
  font: "var(--skn-font-small)",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
// Compact top toolbar.
S.toolbar = {
  display: "flex",
  alignItems: "center",
  gap: "var(--skn-space-2)",
  padding: "6px var(--skn-space-2)",
  background: "var(--skn-surface)",
  borderBottom: "1px solid var(--skn-border)",
  marginBottom: "var(--skn-space-2)",
};
S.statusChip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  font: "var(--skn-font-small)",
  color: "var(--skn-text-muted)",
  whiteSpace: "nowrap",
};
// Small secondary button for Enable all / Disable all on a section header.
S.bulkBtn = {
  font: "var(--skn-font-small)",
  padding: "2px 8px",
  border: "1px solid var(--skn-border)",
  borderRadius: "var(--skn-radius-sm)",
  background: "var(--skn-surface)",
  color: "var(--skn-text)",
  cursor: "pointer",
};
// Header row that holds the disclosure toggle plus trailing sibling controls.
S.disclosureHeaderRow = { display: "flex", alignItems: "center", gap: "var(--skn-space-1)" };
```

- [ ] **Step 2: Append the injected CSS rules**

Find the `THEME_STYLE` template string in `styles.ts` (the injected stylesheet with the `td input{width:100%}` rule and the `.skn-panel` theme blocks). Append these rules inside it:

```css
.skn-panel { --skn-toolbar-height: 52px; }
.skn-toolbar { position: sticky; top: 0; z-index: 2; }
.skn-row { scroll-margin-top: var(--skn-toolbar-height); }
.skn-row:hover { filter: brightness(0.97); }
```

(The `filter: brightness(0.97)` matches the existing panel hover plumbing rather than a zebra stripe.)

- [ ] **Step 3: Verify the gate**

Run: `npm run typecheck && npm run check && npm run build`
Expected: all green. No runtime test (style objects).

- [ ] **Step 4: Commit**

```bash
git add src/panel/styles.ts
git commit -m "feat(panel): add dense-row, rail, and toolbar styles"
```

---

## Task 3: ConversionDetail (lift the expanded editor body)

**Files:**
- Create: `src/panel/components/ConversionDetail.tsx`
- Reference (do not yet delete): `src/panel/components/ConversionCard.tsx:227-306` is the body being lifted.

**Interfaces:**
- Produces: `ConversionDetail` default export with props `{ meta: ConversionMetadata; cfg: ConversionConfig; status: PerConversionStatus | undefined; bodyId: string; onSetResend: (ms: number) => void; onSetSource: (path: string, source: string) => void; onSetExtras: (extras: Record<string, unknown>) => void; sourcesFor: (p: string) => string[]; ensureLoaded: (p: string) => Promise<void>; globalResendSeconds: number }`.
- Consumes: `NumberInput`, `SourceField`, `ExtrasEditor`, `pathToPropName`, the `S` styles used by the current body, `humanizeAgo`, the `COMPATIBILITY_STYLES` map.

- [ ] **Step 1: Create the component from the current body**

Create `src/panel/components/ConversionDetail.tsx`. Move the JSX currently at `ConversionCard.tsx:228-306` (the `<div id={bodyId} style={S.cardBody}>...</div>` contents: the error banner, purpose, note, compat and legacy prose, the resend `NumberInput` row, the `paths.map` of `SourceField`, and `ExtrasEditor`) into this component verbatim, reading from the props above instead of `props.*`. Carry the `COMPATIBILITY_STYLES` map and the `resendPlaceholder` and `errorAgeSuffix` locals (ConversionCard.tsx:160-170) into this file, since they belong to the body.

```typescript
import type * as React from "react";
import type { ConversionMetadata, PerConversionStatus } from "../../api/types.js";
import type { ConversionConfig } from "../../config/schema.js";
import { pathToPropName } from "../../utils/pathUtils.js";
import { humanizeAgo } from "../recency.js";
import { S } from "../styles";
import ExtrasEditor from "./ExtrasEditor";
import NumberInput from "./NumberInput";
import SourceField from "./SourceField";

// (Lift COMPATIBILITY_STYLES here from ConversionCard, unchanged.)

interface Props {
  meta: ConversionMetadata;
  cfg: ConversionConfig;
  status: PerConversionStatus | undefined;
  bodyId: string;
  onSetResend: (ms: number) => void;
  onSetSource: (path: string, source: string) => void;
  onSetExtras: (extras: Record<string, unknown>) => void;
  sourcesFor: (p: string) => string[];
  ensureLoaded: (p: string) => Promise<void>;
  globalResendSeconds: number;
}

export default function ConversionDetail(props: Props): React.ReactElement {
  const { meta, cfg, status } = props;
  const resendPlaceholder =
    props.globalResendSeconds === 0
      ? "global resend disabled"
      : `global: ${props.globalResendSeconds} s`;
  const errorAgeSuffix =
    status?.lastErrorAgeMs !== undefined
      ? ` (${humanizeAgo(status.lastErrorAgeMs)})`
      : "";
  return (
    <div id={props.bodyId} style={S.cardBody}>
      {/* the exact JSX from ConversionCard.tsx:232-305, with props.* renamed to
          the new prop names: status -> status, cfg -> cfg, key scope -> meta.key */}
    </div>
  );
}
```

The implementer copies the inner JSX from ConversionCard lines 232 to 305 unchanged except for the local-name swaps (`props.meta` to `meta`, `props.status` to `status`, `cfg` already matches, `key` becomes `meta.key` for the `idScope` and the source-value read). No logic changes.

- [ ] **Step 2: Verify the gate**

Run: `npm run typecheck && npm run check && npm run build`
Expected: green. `ConversionDetail` is not yet rendered anywhere, so this only checks it compiles.

- [ ] **Step 3: Commit**

```bash
git add src/panel/components/ConversionDetail.tsx
git commit -m "feat(panel): extract ConversionDetail editor body"
```

---

## Task 4: ConversionRow (the dense row)

**Files:**
- Create: `src/panel/components/ConversionRow.tsx`

**Interfaces:**
- Consumes: `rowStatus` and `RailState` (Task 1), `ConversionDetail` (Task 3), the `S` row styles (Task 2), `DisclosureCaret`, `splitPgnTitle`, `pgnSummaryFor`, the `Action` type, `ConversionMetadata`, `PerConversionStatus`, `ConversionConfig`, `emptyConversionConfig`.
- Produces: `ConversionRow` default export wrapped in `memo`, props `{ meta: ConversionMetadata; config: ConversionConfig | undefined; status: PerConversionStatus | undefined; expanded: boolean; dispatch: React.Dispatch<Action>; setExpanded: (key: string) => void; sourcesFor: (p: string) => string[]; ensureLoaded: (p: string) => Promise<void>; globalResendSeconds: number }`. Row container id `skn-row-${key}`, toggle button id `skn-row-toggle-${key}`, detail region id `skn-card-${key}`.

- [ ] **Step 1: Create the row component**

Create `src/panel/components/ConversionRow.tsx`:

```typescript
import type * as React from "react";
import { Fragment, memo, useCallback, useEffect, useRef } from "react";
import { pgnSummaryFor } from "../../api/pgnSummaries.js";
import type { ConversionMetadata, PerConversionStatus } from "../../api/types.js";
import { type ConversionConfig, emptyConversionConfig } from "../../config/schema.js";
import { splitPgnTitle } from "../../utils/pgnUtils.js";
import type { Action } from "../hooks/useConfig";
import type { RailState } from "../rowStatus.js";
import { rowStatus } from "../rowStatus.js";
import { S } from "../styles";
import ConversionDetail from "./ConversionDetail";
import DisclosureCaret from "./DisclosureCaret";

const EMPTY_CFG: ConversionConfig = emptyConversionConfig();

const RAIL_STYLE: Record<RailState, React.CSSProperties> = {
  emitting: S.rowRailEmitting,
  silent: S.rowRailSilent,
  error: S.rowRailError,
  disabled: S.rowRailDisabled,
};

// Garmin badge: an 8px dot in a foreground token, with a visually-hidden label
// so the accessible name is on the collapsed row, not only in the title tooltip.
const COMPAT_DOT: Record<"partial" | "ignores", { color: string; label: string }> = {
  partial: { color: "var(--skn-warn-fg)", label: "Garmin compatibility: partial" },
  ignores: { color: "var(--skn-text-muted)", label: "Garmin compatibility: ignores" },
};

// splitPgnTitle returns { prefix, pgns, suffix } where prefix already ends with
// "(PGN " and suffix is ")"; reconstruct prefix + pgns + suffix (do NOT add
// extra parens). The prefix (the descriptive name) is the truncating part; the
// pgns plus suffix stay nowrap and no-shrink so the PGN numbers are never
// clipped.
function renderTitle(title: string): React.ReactNode {
  const parts = splitPgnTitle(title);
  if (!parts) return <span style={S.rowTitle}>{title}</span>;
  return (
    <span style={S.rowTitleWrap}>
      <span style={S.rowTitle}>{parts.prefix}</span>
      <span style={S.rowPgn}>
        {parts.pgns.map((p, i) => (
          <Fragment key={p}>
            {i > 0 ? ", " : null}
            <span style={S.pgnHover} title={pgnSummaryFor(p)}>{p}</span>
          </Fragment>
        ))}
        {parts.suffix}
      </span>
    </span>
  );
}

interface Props {
  meta: ConversionMetadata;
  config: ConversionConfig | undefined;
  status: PerConversionStatus | undefined;
  expanded: boolean;
  dispatch: React.Dispatch<Action>;
  setExpanded: (key: string) => void;
  sourcesFor: (p: string) => string[];
  ensureLoaded: (p: string) => Promise<void>;
  globalResendSeconds: number;
}

function ConversionRow(props: Props): React.ReactElement {
  const { dispatch, setExpanded } = props;
  const key = props.meta.key;
  const cfg = props.config ?? EMPTY_CFG;
  const bodyId = `skn-card-${key}`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const wasExpanded = useRef(props.expanded);

  const onSetEnabled = useCallback(
    (enabled: boolean) => dispatch({ type: "setEnabled", key, enabled }),
    [dispatch, key],
  );
  const onSetResend = useCallback((ms: number) => dispatch({ type: "setResend", key, ms }), [dispatch, key]);
  const onSetSource = useCallback(
    (path: string, source: string) => dispatch({ type: "setSource", key, path, source }),
    [dispatch, key],
  );
  const onSetExtras = useCallback(
    (extras: Record<string, unknown>) => dispatch({ type: "setExtras", key, extras }),
    [dispatch, key],
  );
  const onToggle = useCallback(() => setExpanded(key), [setExpanded, key]);
  const onRowClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("input, button, select, a, label")) return;
      setExpanded(key);
    },
    [setExpanded, key],
  );

  // Single-open focus return: when this row just collapsed and focus fell to the
  // body (its detail unmounted with focus inside it), return focus to the toggle.
  useEffect(() => {
    if (wasExpanded.current && !props.expanded) {
      const active = document.activeElement;
      if (!active || active === document.body) toggleRef.current?.focus();
    }
    wasExpanded.current = props.expanded;
  }, [props.expanded]);

  const { rail, recency } = rowStatus(props.status, cfg.enabled);
  const compat = props.meta.compatibility?.garmin;
  const compatDot = compat === "partial" || compat === "ignores" ? COMPAT_DOT[compat] : null;

  return (
    <div id={`skn-row-${key}`} ref={rowRef} style={{ ...S.row, ...RAIL_STYLE[rail] }} onClick={onRowClick}>
      <input
        type="checkbox"
        style={S.checkbox}
        checked={cfg.enabled}
        onChange={(e) => onSetEnabled(e.target.checked)}
        aria-label={`Enable ${props.meta.title}`}
      />
      <button
        id={`skn-row-toggle-${key}`}
        ref={toggleRef}
        type="button"
        style={S.rowMain}
        aria-expanded={props.expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <DisclosureCaret expanded={props.expanded} />
        {renderTitle(props.meta.title)}
      </button>
      <span style={S.rowBadgeSlot}>
        {compatDot ? (
          <span aria-hidden="true" style={{ ...S.dot, background: compatDot.color }} title={compatDot.label} />
        ) : props.meta.legacy ? (
          <span style={S.cardLegacy} title={`${props.meta.legacy.note} Superseded by ${props.meta.legacy.supersededBy}.`}>L</span>
        ) : null}
        {compatDot ? <span style={S.visuallyHidden}>{compatDot.label}</span> : null}
        {props.meta.legacy ? <span style={S.visuallyHidden}>Legacy</span> : null}
      </span>
      {props.status?.lastErrorMessage ? (
        <span role="img" aria-label={`Error: ${props.status.lastErrorMessage}`} title={props.status.lastErrorMessage} style={S.errorMark}>
          ⚠
        </span>
      ) : null}
      {recency ? <span style={S.rowRecency}>{recency}</span> : null}
      {props.expanded ? (
        <ConversionDetail
          meta={props.meta}
          cfg={cfg}
          status={props.status}
          bodyId={bodyId}
          onSetResend={onSetResend}
          onSetSource={onSetSource}
          onSetExtras={onSetExtras}
          sourcesFor={props.sourcesFor}
          ensureLoaded={props.ensureLoaded}
          globalResendSeconds={props.globalResendSeconds}
        />
      ) : (
        <div id={bodyId} hidden />
      )}
    </div>
  );
}

export default memo(ConversionRow);
```

Note: the detail and the placeholder are siblings of the row content here for brevity. If the flex row layout places the expanded detail awkwardly, wrap the collapsed-row content and the detail in a column container (a `<div>` with `flexDirection: column`); the detail must render full-width below the row content. Resolve this in the live-admin step of Task 5.

- [ ] **Step 2: Verify the gate**

Run: `npm run typecheck && npm run check && npm run build`
Expected: green. Not yet rendered.

- [ ] **Step 3: Commit**

```bash
git add src/panel/components/ConversionRow.tsx
git commit -m "feat(panel): add dense ConversionRow with single-open detail"
```

---

## Task 5: render rows in PluginConfigurationPanel (single-open) and delete ConversionCard

**Files:**
- Modify: `src/panel/PluginConfigurationPanel.tsx`
- Delete: `src/panel/components/ConversionCard.tsx`

**Interfaces:**
- Produces: panel state `expandedKey: string | null`; a stable `toggleExpand: (key: string) => void`; rows wrapped in a `S.rowList` container per section.

- [ ] **Step 1: Replace the expansion state and toggle**

In `PluginConfigurationPanel.tsx`, replace `const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})` (lines 94-96) with:

```typescript
const [expandedKey, setExpandedKey] = useState<string | null>(null);
```

Replace `toggleCard` (lines 117-119) with a stable single-open toggle:

```typescript
const toggleExpand = useCallback((key: string): void => {
  setExpandedKey((prev) => (prev === key ? null : key));
}, []);
```

- [ ] **Step 2: Update renderCard to render a row**

Replace `renderCard` (lines 257-270) and its `ConversionCard` import with `ConversionRow`:

```typescript
import ConversionRow from "./components/ConversionRow";
// ...
const renderRow = (m: ConversionMetadata): React.ReactElement => (
  <ConversionRow
    key={m.key}
    meta={m}
    config={state.conversions[m.key]}
    status={statusByKey.get(m.key)}
    expanded={expandedKey === m.key}
    dispatch={dispatch}
    setExpanded={toggleExpand}
    sourcesFor={sourcesFor}
    ensureLoaded={ensureLoaded}
    globalResendSeconds={state.globalResendInterval}
  />
);
```

Update both call sites that used `renderCard` (the search branch at line 423 and the tab branch at line 463) to `renderRow`, and wrap each section's rows in the hairline container. The `CollapsibleSection` children become `<div style={S.rowList}>{g.list.map(renderRow)}</div>` (search) and `<div style={S.rowList}>{s.list.map(renderRow)}</div>` (tabs).

- [ ] **Step 3: Update jumpToFirstError for single-open and focus**

In `jumpToFirstError` (lines 202-225), replace `setExpandedCards((prev) => ({ ...prev, [m.key]: true }))` with `setExpandedKey(m.key)`, and change the scroll target plus add a focus move inside the double `requestAnimationFrame`:

```typescript
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.getElementById(`skn-row-${m.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(`skn-row-toggle-${m.key}`)?.focus();
  });
});
```

(Keep the other four side effects: `clearSearch`, `setView("configure")`, `setTab`, and the `setOpenSections` line, unchanged.)

- [ ] **Step 4: Delete ConversionCard**

```bash
git rm src/panel/components/ConversionCard.tsx
```

- [ ] **Step 5: Verify the gate**

Run: `npm run typecheck && npm run check && npm test && npm run build`
Expected: all green (no remaining import of `ConversionCard`).

- [ ] **Step 6: Live-admin check (density and accordion)**

Restart the local signalk service and open the panel. Confirm: a category renders as dense rows in one bordered surface; clicking a row opens its editor and opening another closes the first; the detail renders full width below the row (fix the row container to a column wrapper if not, per Task 4 note); the Navigation Modern section fits within about two viewport heights at 1080p. Tab keyboard: collapsing a row with focus inside returns focus to its toggle.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(panel): render dense rows with single-open accordion"
```

---

## Task 6: per-category Enable all and Disable all

**Files:**
- Modify: `src/panel/components/Disclosure.tsx`
- Modify: `src/panel/components/CollapsibleSection.tsx`
- Modify: `src/panel/PluginConfigurationPanel.tsx`

**Interfaces:**
- Produces: `Disclosure` gains `headerTrailing?: React.ReactNode`. `CollapsibleSection` gains `onEnableAll?: () => void` and `onDisableAll?: () => void`. Panel gains `setEnabledForKeys(keys: string[], enabled: boolean): void`.
- Consumes: existing `setEnabled` reducer action; `S.bulkBtn`, `S.disclosureHeaderRow`, `S.visuallyHidden`.

- [ ] **Step 1: Add headerTrailing to Disclosure**

In `Disclosure.tsx`, add `headerTrailing?: React.ReactNode;` to `Props`, accept it in the destructure, and wrap the header when it is present:

```typescript
{headerTrailing != null ? (
  <div style={S.disclosureHeaderRow}>
    <button type="button" style={headerStyle} aria-expanded={open} aria-controls={id} onClick={toggle}>
      <DisclosureCaret expanded={open} />
      {label}
      {summary != null ? <span style={SUMMARY}>{summary}</span> : null}
    </button>
    {headerTrailing}
  </div>
) : (
  <button type="button" style={headerStyle} aria-expanded={open} aria-controls={id} onClick={toggle}>
    <DisclosureCaret expanded={open} />
    {label}
    {summary != null ? <span style={SUMMARY}>{summary}</span> : null}
  </button>
)}
```

The body block (lazy ternary) is unchanged. The bulk controls are now siblings outside the toggle button, so they are valid HTML and do not toggle the disclosure.

- [ ] **Step 2: CollapsibleSection renders the bulk controls and announces**

In `CollapsibleSection.tsx`, add `onEnableAll?: () => void` and `onDisableAll?: () => void` to `Props`. Add a local announcement and pass the controls via `headerTrailing` only when the handlers exist:

```typescript
import { useState } from "react";
// ...
const [announce, setAnnounce] = useState("");
const trailing =
  onEnableAll && onDisableAll ? (
    <>
      <button type="button" style={S.bulkBtn} onClick={() => { onEnableAll(); setAnnounce(`Enabled ${count} conversions in ${title}.`); }}>
        Enable all
      </button>
      <button type="button" style={S.bulkBtn} onClick={() => { onDisableAll(); setAnnounce(`Disabled ${count} conversions in ${title}.`); }}>
        Disable all
      </button>
      <span role="status" style={S.visuallyHidden}>{announce}</span>
    </>
  ) : undefined;
```

Pass `headerTrailing={trailing}` to the `Disclosure`.

- [ ] **Step 3: Wire the handlers in the panel (tab view only)**

In `PluginConfigurationPanel.tsx`, add the helper and keep `enableKeys` as a thin wrapper so the wizard prop is unchanged:

```typescript
const setEnabledForKeys = useCallback(
  (keys: string[], enabled: boolean): void => {
    for (const k of keys) dispatch({ type: "setEnabled", key: k, enabled });
  },
  [dispatch],
);
const enableKeys = useCallback((keys: string[]) => setEnabledForKeys(keys, true), [setEnabledForKeys]);
```

(Replace the existing `enableKeys` definition at lines 154-160.)

In the TAB branch only (the `sections.map` at lines 444-466), pass the bulk handlers to `CollapsibleSection`:

```typescript
onEnableAll={() => setEnabledForKeys(s.list.map((m) => m.key), true)}
onDisableAll={() => setEnabledForKeys(s.list.map((m) => m.key), false)}
```

Do NOT pass them in the search branch (lines 406-426), so bulk actions never appear on a partial search section.

- [ ] **Step 4: Verify the gate**

Run: `npm run typecheck && npm run check && npm test && npm run build`
Expected: green.

- [ ] **Step 5: Live-admin check**

Confirm the section header shows Enable all and Disable all outside the toggle, clicking them toggles every row in that section, clicking them does not also collapse the section, and they are absent on search results.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(panel): per-category enable all and disable all"
```

---

## Task 7: PanelToolbar and the status chip

**Files:**
- Create: `src/panel/components/PanelToolbar.tsx`
- Delete: `src/panel/components/StatusDashboard.tsx` (its render moves here)

**Interfaces:**
- Produces: `PanelToolbar` default export, props `{ status: StatusSnapshot | null; lastUpdatedMs?: number; onErrorBadgeClick: () => void; search: string; onSearch: (v: string) => void; onClearSearch: () => void; view: PanelView; onChangeView: (v: PanelView) => void; onOpenWizard: () => void }`.
- Consumes: `SegmentedControl`, `ThemeToggle`, `ErrorBadgeButton`, `S.toolbar`, `S.statusChip`, `S.searchInput`, `S.searchClear`, `S.dot`, `S.dotOk`, `S.dotWait`, the `STALE_AFTER_MS` staleness logic lifted from `StatusDashboard`.

- [ ] **Step 1: Create PanelToolbar**

Create `src/panel/components/PanelToolbar.tsx`. Lift the dot, the enabled-count, the readiness word, the `STALE_AFTER_MS` stale marker, and the `ErrorBadgeButton` from `StatusDashboard.tsx` into a compact chip, and add the search, the view `SegmentedControl`, the `ThemeToggle`, and the wizard button:

```typescript
import type * as React from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { humanizeAgo } from "../recency.js";
import { S } from "../styles";
import ErrorBadgeButton from "./ErrorBadgeButton";
import SegmentedControl from "./SegmentedControl";
import ThemeToggle from "./ThemeToggle";

const STALE_AFTER_MS = 10000;
type PanelView = "configure" | "status";

interface Props {
  status: StatusSnapshot | null;
  lastUpdatedMs?: number;
  onErrorBadgeClick: () => void;
  search: string;
  onSearch: (v: string) => void;
  onClearSearch: () => void;
  view: PanelView;
  onChangeView: (v: PanelView) => void;
  onOpenWizard: () => void;
  viewChoices: ReadonlyArray<{ value: PanelView; label: string }>;
}

export default function PanelToolbar(props: Props): React.ReactElement {
  const s = props.status;
  const ready = s?.nmea2000Ready === true;
  const errors = s ? s.perConversion.filter((c) => c.lastErrorMessage).length : 0;
  const staleAgeMs = props.lastUpdatedMs;
  const stale = staleAgeMs !== undefined && staleAgeMs > STALE_AFTER_MS;
  return (
    <div className="skn-toolbar" style={S.toolbar} role="region" aria-label="Panel controls">
      <input
        type="search"
        style={S.searchInput}
        value={props.search}
        placeholder="Search conversions by name, PGN, or path"
        aria-label="Search conversions by name, PGN, or path"
        onChange={(e) => props.onSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") props.onClearSearch(); }}
      />
      <span style={S.statusChip} role="status">
        <span style={{ ...S.dot, ...(ready ? S.dotOk : S.dotWait) }} />
        {s ? `${s.enabledCount} / ${s.totalConversions}` : "..."}
        {" "}{ready ? "ready" : "waiting"}
        {stale ? <span style={{ marginLeft: 6 }}>updated {humanizeAgo(staleAgeMs)} ago</span> : null}
      </span>
      {errors > 0 ? <ErrorBadgeButton count={errors} onClick={props.onErrorBadgeClick} /> : null}
      <SegmentedControl legend="View" choices={props.viewChoices} value={props.view} onChange={props.onChangeView} />
      <ThemeToggle />
      <button type="button" style={S.btnSecondary} onClick={props.onOpenWizard}>Setup wizard</button>
    </div>
  );
}
```

The `StatusSnapshot` fields are verified: `nmea2000Ready: boolean`, `enabledCount: number`, `totalConversions: number`, and `perConversion: PerConversionStatus[]`. The chip reads exactly what `StatusDashboard.tsx:44-65` reads today (`status.nmea2000Ready`, `status.enabledCount`, `status.totalConversions`, the `lastErrorMessage` error count), so the lift is a straight copy with no field reconciliation needed.

- [ ] **Step 2: Verify the gate**

Run: `npm run typecheck && npm run check && npm run build`
Expected: green. Not yet wired.

- [ ] **Step 3: Commit**

```bash
git add src/panel/components/PanelToolbar.tsx
git commit -m "feat(panel): add compact PanelToolbar with status chip"
```

---

## Task 8: compose the toolbar and collapsed disclosures into the panel

**Files:**
- Modify: `src/panel/PluginConfigurationPanel.tsx`
- Delete: `src/panel/components/StatusDashboard.tsx`

**Interfaces:**
- Consumes: `PanelToolbar` (Task 7); the existing `PresetChips`, `AdvisorPanel`, `GlobalSettings`, and `Disclosure`.

- [ ] **Step 1: Replace the control bar and StatusDashboard with PanelToolbar**

In `PluginConfigurationPanel.tsx`, replace the `S.controlBar` block (lines 277-297) and the `StatusDashboard` render (lines 312-316) with a single `PanelToolbar` placed at the top of the returned tree, above the `hidden` view containers:

```typescript
<PanelToolbar
  status={status}
  lastUpdatedMs={lastUpdatedMs ?? undefined}
  onErrorBadgeClick={jumpToFirstError}
  search={search}
  onSearch={setSearch}
  onClearSearch={clearSearch}
  view={view}
  onChangeView={changeView}
  onOpenWizard={() => setWizardOpen(true)}
  viewChoices={VIEW_CHOICES}
/>
```

Remove the now-unused `StatusDashboard` import and the standalone search row block (lines 372-394), since search now lives in the toolbar.

- [ ] **Step 2: Wrap presets, the Advisor, and global settings in collapsed disclosures**

Replace the bare `PresetChips`, `AdvisorPanel`, and `GlobalSettings` renders (lines 363-371, and the `AdvisorPanel` at 317-325) with collapsed `Disclosure`s keyed under the `panel:*` namespace in `openSections`. The Advisor uses the default non-lazy disclosure so its state survives collapse; presets and global may be lazy:

```typescript
<Disclosure id="skn-panel-presets" label="Quick presets" lazy
  open={openSections["panel:presets"] ?? false} onToggle={() => toggleSection("panel:presets")}>
  <PresetChips onApply={(p) => dispatch({ type: "applyPreset", preset: p, meta })} meta={meta} />
</Disclosure>

<Disclosure id="skn-panel-advisor" label="Config Advisor"
  open={openSections["panel:advisor"] ?? false} onToggle={() => toggleSection("panel:advisor")}>
  <AdvisorPanel
    advisor={state.advisor}
    onChangeAdvisor={(advisor) => dispatch({ type: "setAdvisor", advisor })}
    dirty={dirty}
    advisorSettingsDirty={advisorSettingsDirty}
    metaByKey={metaByKey}
  />
</Disclosure>

<Disclosure id="skn-panel-global" label="Global settings" lazy
  open={openSections["panel:global"] ?? false} onToggle={() => toggleSection("panel:global")}>
  <GlobalSettings value={state.globalResendInterval} onChange={(ms) => dispatch({ type: "setGlobalResend", ms })} />
</Disclosure>
```

Keep the error and meta banners and the first-run callout between the toolbar and the disclosures, as today. Delete the standalone `<h3>Quick presets...` heading (line 363); the disclosure label carries it.

- [ ] **Step 3: Delete StatusDashboard**

```bash
git rm src/panel/components/StatusDashboard.tsx
```

- [ ] **Step 4: Verify the gate**

Run: `npm run typecheck && npm run check && npm test && npm run build`
Expected: all green (no remaining `StatusDashboard` import).

- [ ] **Step 5: Live-admin check (chrome and sticky)**

Confirm conversions begin near the top; presets, the Advisor, and global settings are collapsed one-line disclosures that open on click; the Advisor keeps its pending state when collapsed and reopened; the toolbar search filters; the status chip shows the count, the readiness word, the stale marker when the poll is stale, and the error badge. Verify whether `position: sticky` actually pins the toolbar in the live admin; if it does not (the existing footer does not float, so it may not), remove `position: sticky` from the `.skn-toolbar` rule and keep the compact non-sticky bar (height under about 56 px). Record the result.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(panel): compact toolbar and collapsed chrome disclosures"
```

---

## Task 9: accessibility, theme, and final verification

**Files:**
- Modify (only as the checks surface fixes): `src/panel/components/ConversionRow.tsx`, `PanelToolbar.tsx`, `styles.ts`.

- [ ] **Step 1: Keyboard and screen-reader pass (live admin)**

Verify: Tab order is search, status chip controls, view toggle, theme, wizard, then the disclosures, then the rows. A row's checkbox toggles enable; the row body and caret toggle the editor; arrow and space behave on the checkbox and the toggle as native controls. Collapsing a focused-into row returns focus to its toggle. `jumpToFirstError` (the chip error badge) lands focus on the target row's toggle, below the toolbar. The Garmin dot and the legacy "L" expose their label to a screen reader (visually-hidden text). Enable all and Disable all announce their count.

- [ ] **Step 2: Theme pass (live admin)**

In light, dark, and night, confirm: rows are legible on the hairline container; emitting versus silent is distinguishable in night by the recency text and the rail pattern, not hue; the Garmin dot is visible in all three; the chip readiness reads from the word in night. Fix any token contrast issue by swapping to an existing token (no new token).

- [ ] **Step 3: Density acceptance**

Confirm the Navigation category with Modern expanded fits within about two viewport heights at 1080p and the standard admin sidebar width.

- [ ] **Step 4: Full gate**

Run: `npm run typecheck && npm run check && npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(panel): accessibility and theme polish for the dense panel"
```

(Skip this commit if Steps 1 to 4 surfaced no changes.)

---

## Self-review notes

- Spec coverage: dense rows (Tasks 2, 4, 5), status rail with night-safe redundancy (Tasks 1, 2, 4, 9), inline single-open accordion with focus return (Tasks 4, 5), the lifted detail (Task 3), the compact toolbar and chip with the stale marker (Tasks 7, 8), the collapsed disclosures with the non-lazy Advisor (Task 8), per-category bulk via the refactored header (Task 6), the PGN no-truncate rule (Task 2 `S.rowPgn`, Task 4 `renderTitle`), the visually-hidden badge labels (Task 4), `jumpToFirstError` focus (Task 5), and the density acceptance criterion (Task 9). All spec sections map to a task.
- Type consistency: `rowStatus`, `RailState`, and `RowStatus` (Task 1) are consumed unchanged in Task 4. `setEnabledForKeys(keys, enabled)` (Task 6) is the single bulk helper. `expandedKey` and `toggleExpand`/`setExpanded` are consistent across Tasks 4 and 5. `bodyId` is `skn-card-${key}` in both `ConversionRow` and the `aria-controls` target.
- Verified against code: the `StatusSnapshot` fields used in Task 7 (`nmea2000Ready`, `enabledCount`, `totalConversions`, `perConversion`), the `splitPgnTitle` `{ prefix, pgns, suffix }` shape used in Task 4's `renderTitle` (prefix already carries `(PGN `, so no parens are added), and `S.visuallyHidden`, the `--skn-*` tokens, and the `setEnabled` reducer action. The one item resolved during implementation, not a placeholder: whether the dense row needs a column wrapper so the expanded detail sits full-width below the row content (Task 4 note, settled in Task 5 Step 6 live-admin check).
