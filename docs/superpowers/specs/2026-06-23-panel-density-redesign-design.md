# Config panel density redesign

Date: 2026-06-23
Status: approved design, reviewed by a four-lens panel, pending implementation plan

## Problem

The plugin's admin config panel (the federated React panel in `src/panel/`)
renders each of the 75 conversions as a tall, full-width boxed card
(`ConversionCard`). With per-card padding plus a 12 px gap, each collapsed row
costs roughly 60 to 70 px. The Navigation category alone (26 conversions) spans
about four screens, and there are eight categories. Before the list even starts,
a stack of chrome (status dashboard, Config Advisor disclosure, a presets
heading and chips, global settings, and the search row) consumes close to a full
screen. The panel sits in the admin's right column, so the left half of the page
is empty while the user scrolls. The headline complaint: four pages of scrolling
to get through one category.

## Goal

Cut scrolling sharply. A category should fit in roughly one screen instead of
four (about 2x row density). Keep every existing feature: search, presets, the
Config Advisor, Modern and Legacy grouping, per-conversion source and resend and
extras editing, the Status view, the first-run wizard, and the theme toggle.
This is layout and density work, not a feature change.

## Approved decisions

Four UI and UX reviews converged on a shared foundation, with three forks the
user resolved:

Shared foundation:
- Dense rows in one bordered surface separated by hairline dividers, not boxed
  cards. Single column. A 3 px left status rail carries live state as a
  supporting cue.
- A compact toolbar at the top carrying search, a live status chip, and the
  Configure and Status and theme toggles, so conversions begin near the top.
- Per-category Enable all and Disable all on the section header.

Resolved forks (all to the recommended pick):
1. Edit model: inline accordion. A row expands in place to reveal its editor,
   one row open at a time. Reuses the existing edit body and gives the big
   mapping tables full column width. Chosen over a docked side Inspector.
2. Navigation: keep category tabs (one category visible at a time, least
   scrolling). Chosen over an eight-category accordion map.
3. Chrome: a sticky toolbar plus collapsed one-line disclosures for presets, the
   Advisor, and global settings (visible, one click away). Chosen over hiding
   those behind a "More" popover.

## Design

### Layout, top to bottom (Configure view)

1. Compact toolbar: `[ search ]  (status chip 36/75 ready)  [Configure | Status]
   [theme]  [wizard]`. Sticky if the host scroll context allows it (see Risks).
2. Error and meta-load banners (only when present), then the first-run callout
   (only when `enabledCount === 0`).
3. Three collapsed one-line disclosures: Quick presets, Config Advisor, Global
   settings. Collapsed by default.
4. Category tabs (compact, the existing `CategoryTabs`).
5. The active category as one or two bordered sections (Modern expanded, Legacy
   collapsed), each a hairline-divided list of dense rows, with Enable all and
   Disable all plus the count on the section header.
6. The existing sticky footer (Save and Discard).

The Status view (the Status tab) is unchanged and still swaps in via the
segmented toggle, both views staying mounted as today.

### Dense row anatomy

About 34 px tall (4 px vertical padding plus a 22 px checkbox target, which is
preserved). Left to right inside one hairline-divided container:

`[3px status rail] [checkbox] [caret] [title] [(PGN nnnnn) muted] [fixed badge
slot] [error glyph] [recency, right-aligned]`

- Title in `--skn-text`, 15 px, weight 600. Only the title PROSE truncates with
  an ellipsis at the column edge (full title in the native `title` tooltip). The
  `(PGN nnnnn)` run is the existing `splitPgnTitle` plus `S.pgnHover` output
  wrapped in its own element with `white-space: nowrap` and `flex-shrink: 0`, so
  the ellipsis eats only the prose and the PGN numbers stay visible and keep
  their per-PGN hover summaries. Without that nowrap-and-no-shrink rule the
  PGN run would be clipped, so it is a requirement, not a default.
- Recency right-aligns into a column in `--skn-text-faint`, 12 px. For an
  ENABLED conversion the column is never blank: emitting shows "N emits, last Xs
  ago" (the age may shorten on a narrow column), and a silent conversion always
  shows "no recent output" (a short "idle" on the narrowest column). A disabled
  conversion shows nothing. So emitting versus silent is always distinguishable
  by text, independent of the rail hue.
- The trailing badge slot is a fixed-width reserved box so a row with no badge
  does not shift the recency column. It holds at most a compatibility dot or a
  legacy mark:
  - Garmin partial and ignores collapse from the current pill to an 8 px dot.
    The dot fill uses a FOREGROUND token (`--skn-warn-fg` for partial,
    `--skn-text-muted` for ignores), not a border or neutral token, so it stays
    legible as a standalone mark in dark and night. "Garmin: displays" shows no
    dot, as today.
  - Legacy collapses to a small muted "L" using the existing `S.cardLegacy`
    palette.
  - Every collapsed badge carries a visually-hidden text label (`S.visuallyHidden`,
    styles.ts:580) giving its full meaning ("Garmin compatibility: partial",
    "Legacy"), so the accessible name is on the collapsed row itself, not only in
    a mouse `title` or the unmounted expanded body.

### Status rail encoding

The 3 px left rail (`borderLeft`) is a SUPPORTING cue for live state. It is not
the sole discriminator, because in the night theme `--skn-ok` and `--skn-wait`
are both amber (their mutual contrast is far below the 3:1 needed to read two
fills apart on a 3 px stripe). The spec therefore does NOT claim the rail hue
distinguishes emitting from silent in night.

- Emitting: a filled rail in `--skn-ok`.
- Enabled but no recent output (silent): a visually distinct rail treatment that
  does not depend on hue (a hollow or dashed 3 px rail) in `--skn-wait`, so
  emitting and silent differ by pattern, not only by a hue that collides in
  night. The always-present "no recent output" recency text is the load-bearing
  distinction.
- Error: rail `--skn-danger-fg`, plus the existing `S.errorMark` warning glyph
  and the inline `role="alert"` banner in the expanded body.
- Disabled: no rail, checkbox unchecked, title at full `--skn-text` so disabled
  rows stay scannable.

The "rail is decorative" claim is scoped to the enabled-versus-disabled axis.
The emitting-versus-silent distinction is carried by the recency text and the
rail pattern, both available without relying on hue. All four states map to
existing tokens; no new custom property is required.

### Inline accordion edit (single open)

Clicking a row (or its caret) expands a detail panel directly beneath it,
spanning the full container width. Opening a row collapses any previously open
row, so the list never balloons. This is a behavior change from today's
multiple-open model and carries two requirements:

- Focus: when opening row B collapses row A and focus was inside A's detail
  region, focus returns to A's disclosure button in the same commit that flips
  A's `aria-expanded` to false. Otherwise focus falls to `document.body`. This
  is a requirement, not a verify-later item.
- Referential stability: the per-row toggle must be a stable callback (a single
  `setExpandedKey`-style handler with the key bound through the memoized row,
  mirroring today's `toggleCard` at PluginConfigurationPanel.tsx:117), not a
  fresh inline arrow per render. An inline arrow changes every row's prop
  identity each render and defeats `memo()`, re-rendering all rows on every
  expand.

The detail body is the current `ConversionCard` expanded content (lines 227 to
306), lifted unchanged into a new `ConversionDetail.tsx`: the error banner, the
purpose and note prose, the compatibility and legacy notes, the resend
`NumberInput` (including its "global: N s" placeholder), one `SourceField` per
Signal K path, and the `ExtrasEditor` (the full-width battery, engine, tank,
solar, exhaust, and brightness mapping tables). The body reads only from props
(meta, config, status, the four `onSet*` callbacks, `sourcesFor`,
`ensureLoaded`, `globalResendSeconds`) and holds no local state, so it lifts
cleanly. No editing logic changes. Source and resend fields stay editable
whether or not the conversion is enabled, so a source can be set before the
enable box is ticked.

### Compact toolbar

A new `PanelToolbar` replaces the current control bar plus the full status
dashboard. It is a labelled region (`role="region"` with an `aria-label`, or a
search landmark), NOT `role="toolbar"`, because its contents are heterogeneous
(a search input, a `SegmentedControl` fieldset, a `ThemeToggle`, a button) and
do not implement the arrow-key roving that `role="toolbar"` implies. Pinned DOM
and focus order: search, status chip, view toggle, theme, wizard.

- Search input, relocated from the standalone search row, always visible and the
  primary find path. Typing flattens matches across all categories into the same
  dense rows grouped by category (the existing `searchResult` path).
- A condensed status chip derived from `StatusDashboard`: a state dot, the
  enabled-over-total count, and a readiness word, with `role="status"` on the
  readiness-and-count text so "waiting" to "ready" still announces. In night the
  readiness is carried by the WORD, not the dot hue (same ok-versus-wait amber
  collision as the rail). It keeps the existing `ErrorBadgeButton` verbatim for
  the jump-to-error action and its accessible name. It also keeps a VISIBLE stale
  marker when the poll is stale (the `STALE_AFTER_MS` "updated Xs ago" signal at
  StatusDashboard.tsx:49); `StatusView` does not surface staleness, so it cannot
  be hidden in a tooltip only.
- The Configure and Status `SegmentedControl` and the `ThemeToggle`, moved up
  into the toolbar's right cluster.
- The Setup wizard shortcut: an icon-plus-label button at the trailing end of
  the right cluster, collapsing to icon-only on a narrow column. The first-run
  callout keeps its own wizard button for the zero-enabled case.

Sticky: the toolbar uses `position: sticky` with a `--skn-toolbar-height` CSS
custom property set on the toolbar container and referenced by each row's
`scroll-margin-top`, so a jumped or focused row lands below the bar rather than
under it. See Risks for the host-scroll-context caveat and the non-sticky
fallback.

### Collapsed disclosures

Quick presets (`PresetChips`), the Config Advisor (`AdvisorPanel`), and Global
settings (`GlobalSettings`) become collapsed one-line disclosures directly below
the toolbar, reusing the existing `Disclosure` primitive, collapsed by default.

- The Advisor disclosure MUST use the non-lazy `Disclosure` (the `lazy = false`
  default, which toggles the `hidden` attribute and keeps children mounted,
  Disclosure.tsx:88). `AdvisorPanel` holds its review, pending, and decision
  state in component-local `useState` (useAdvisor.ts:29, AdvisorPanel.tsx:51), so
  a lazy disclosure that unmounts children on collapse would drop parked
  decisions and refetch on every reopen. Presets and Global settings may use the
  lazy variant (they are cheap to remount).
- Disclosure open state lives in the existing session-local `openSections` map
  under a distinct namespace: `panel:presets`, `panel:advisor`, and
  `panel:global`, separate from the `category:group` keys. Any Advisor
  parked-decision count surfaces on its disclosure header.

### Per-category bulk enable and disable

The Modern and Legacy section headers gain an Enable all and a Disable all
control acting on that section's list, plus the existing live enabled count.
These complement, and do not replace, the cross-category preset chips.

Two implementation constraints:

- The bulk buttons CANNOT nest inside the section's disclosure toggle, because
  `Disclosure` renders its header as a single `<button>` (Disclosure.tsx:67) and
  a button cannot contain buttons. `CollapsibleSection` must be refactored so its
  header is a row containing the disclosure toggle button plus the Enable all and
  Disable all buttons as siblings OUTSIDE the toggle button (mirroring how the
  card checkbox and badges sit outside the card disclosure today). `Disclosure`
  itself renders a fragment, so the section wrapper can place the sibling
  controls; no change to `Disclosure` is required.
- Bulk actions call a single `setEnabledForKeys(keys, enabled)` helper that loops
  the existing `setEnabled` reducer action (Enable all passes `true`, Disable all
  passes `false`). This generalizes today's enable-only `enableKeys`
  (PluginConfigurationPanel.tsx:154); there is no `disableKeys` today and no new
  reducer case is needed. The action announces via `role="status"` with a stated
  string, for example "Enabled N conversions in Navigation Modern." or "Disabled
  N conversions in Navigation Modern.", matching the preset-apply pattern.

Bulk actions appear only on the tabbed-view section headers, NOT on
search-result section headers, because a search section is a possibly-partial
subset of a category and a category-scoped bulk action there would be surprising.

## Component changes

Add:
- `PanelToolbar.tsx`: the toolbar (labelled region, search, status chip, view
  toggle, theme, wizard shortcut, `--skn-toolbar-height`).
- `ConversionRow.tsx`: the dense collapsed row (rail, checkbox, caret, title,
  PGN, fixed badge slot, error glyph, recency), memoized, with a stable toggle.
- `ConversionDetail.tsx`: the expanded edit body lifted unchanged from today's
  `ConversionCard`. Split out rather than kept inline, because `ConversionCard`
  is already 320 lines and a combined row-plus-detail file would exceed 400.

Modify:
- `PluginConfigurationPanel.tsx`: new composition; single-open `expandedKey:
  string | null` with a stable toggle; `setEnabledForKeys`; `jumpToFirstError`
  updated (see State and data flow); toolbar wiring; the `panel:*` disclosure
  keys.
- `CollapsibleSection.tsx`: header refactored to a row with the disclosure toggle
  plus sibling Enable all and Disable all controls and the status announcement.
- `styles.ts`: dense-row, hairline-container, status-rail (filled versus
  hollow/dashed), toolbar (with `--skn-toolbar-height`), fixed badge slot, and
  the badge-dot foreground-token fills, composed from existing tokens and the
  `S.dot`, `S.cardCompatibility`, `S.cardLegacy`, `S.errorMark`, and
  `S.visuallyHidden` styles. No new custom-property tokens.
- `StatusDashboard.tsx`: condensed into the toolbar chip (keep `role="status"`,
  `ErrorBadgeButton`, and a visible stale marker).

Reuse unchanged: `SegmentedControl`, `ThemeToggle`, `PresetChips`,
`AdvisorPanel`, `GlobalSettings`, `StatusView`, `SourceField`, `NumberInput`,
`ExtrasEditor` and the `extras/` editors, `FirstRunWizard`, `FooterBar`,
`CategoryTabs`, `Disclosure`, `DisclosureCaret`, `recency.ts`.

## State and data flow

- All edits continue to flow through the existing `useConfig` reducer and the
  `state` versus `savedState` dirty check, so the global Save and Discard, the
  `beforeunload` guard, and the three-way `mergeExternalConfig` cover the new
  layout with no new save logic. Bulk enable and disable dispatch the existing
  `setEnabled` action per key, so they produce normal reducer state.
- Expansion state changes from `expandedCards: Record<string, boolean>` to a
  single `expandedKey: string | null` (single open) with a referentially stable
  toggle.
- `jumpToFirstError` (PluginConfigurationPanel.tsx:202) keeps all of its current
  side effects: `clearSearch`, `setView("configure")`, `setTab(category)`,
  opening the target section, and the double-`requestAnimationFrame`
  scroll-into-view. Only the card-expand line changes from a `Record` merge to
  `setExpandedKey(key)`, AND it must additionally move focus to the target row's
  disclosure button, because today it scrolls but moves no focus, leaving
  keyboard and screen-reader users on the chip.

## Accessibility

- The dense row keeps the current split: a real checkbox (`aria-label` "Enable
  <title>") and a separate disclosure `button` with `aria-expanded` and
  `aria-controls` pointing at the detail region's id. The whole-row click
  delegates to the disclosure (the full row height is the primary expand target,
  so the small caret is not the only hit area) and keeps the
  `closest("input, button, select, a, label")` guard so interactive controls are
  never swallowed. While collapsed, the row still renders the hidden detail
  placeholder so `aria-controls` always resolves, as today.
- Single-open: focus returns to the closing row's disclosure button when focus
  was inside its detail, with `aria-expanded` synced in the same commit.
- Collapsed badges carry visually-hidden text labels (the dot and the "L"), so
  their meaning is not locked in a mouse `title` or the unmounted body.
- The toolbar is a labelled region, not `role="toolbar"`. The status chip keeps
  `role="status"` and the verbatim `ErrorBadgeButton`. The search keeps its
  `aria-label`.
- Enable all, Disable all, and the search summary announce via `role="status"`
  with the stated strings above.
- `jumpToFirstError` moves focus to the target row's disclosure button, not only
  the scroll position. `scroll-margin-top` keyed to `--skn-toolbar-height` keeps
  the toolbar from covering the focused row.

## Theming and responsive

- Every color and space is an existing `--skn-*` token, so light, dark, and the
  red-preserving night theme inherit with no per-theme component branching.
- Night caveat: `--skn-ok` and `--skn-wait` are both amber in night, so the rail
  hue does not distinguish emitting from silent, and the chip readiness dot does
  not distinguish ready from waiting. The redundant cues carry it: the recency
  text (always populated for an enabled row), the rail pattern (filled versus
  hollow), and the readiness word.
- Single column at all widths. Density comes from row height, not columns,
  because the host right column is already narrow (about 760 px, narrower with
  the admin sidebar open) and a two-column grid would truncate long titles.
- The list is one outer bordered container with `1px solid var(--skn-border)`
  dividers, no per-row box, radius, or gap, with a faint row hover for
  affordance, not a zebra stripe (zebra is invisible in night, where both
  surfaces are near-black). Confirm at the narrowest width that the rail,
  checkbox, caret, title, PGN run, fixed badge slot, error glyph, and recency do
  not crush the recency column to zero before the age-only fallback engages.

## Error handling and edge cases

- Empty category: the existing "No conversions in this category." message.
- Catalog load error and loading states: the existing banners and loading text,
  rendered below the toolbar.
- First-run (`enabledCount === 0`): the existing callout, below the toolbar and
  above the disclosures, with its own wizard button.
- Long titles truncate with the PGN preserved; recency shortens on a narrow
  column but is never blank for an enabled conversion.
- Search mode renders the same dense rows grouped by category, without the bulk
  Enable all and Disable all controls.

## Testing

- Keep every gate green: the three `tsc` configs, biome, the build, and the full
  test suite (the exact count drifts as the redesign adds tests, so it is not
  pinned here).
- Add unit tests for the pure mapping from `(status, enabled)` to the rail
  treatment and the recency text (emitting, silent, error, and disabled), and
  for the `setEnabledForKeys` helper if it is extracted as a pure function.
- `useConfig` reducer tests are unaffected, since bulk enable and disable reuse
  the existing `setEnabled` action.
- Conversion modules are untouched, so `index.test.ts` (the 75 runtime
  conversions) is unaffected.
- Density acceptance criterion (the definition of done for the goal): the
  Navigation category with the Modern section expanded fits within about two
  viewport heights on a 1080p display at the standard admin sidebar width, down
  from about four today. Verified in the live admin (the user permits restarting
  the local signalk service).
- Live-admin verification: the density criterion, sticky behavior and the
  non-sticky fallback, all three themes (especially that emitting versus silent
  is distinguishable in night via the recency text, not hue), keyboard
  navigation (single-open focus return, the jump-to-error focus move), and a
  screen-reader sanity pass over the badge labels and the status announcements.

## Risks and items to verify in the live admin

1. Sticky positioning. The panel renders in a host-scrolled container, so
   `position: sticky` resolves against the nearest scroll ancestor, which may be
   the admin content area rather than the panel. In the current screenshots the
   "sticky" footer actually sits at the end of the content, not floating, which
   suggests the host scroll context will not pin a sticky child. If the toolbar
   does not pin, ship it non-sticky but still compact, with a height budget under
   about 56 px so the chrome-reduction goal holds either way. The density win
   does not depend on sticky.
2. Night emitting-versus-silent legibility. Mitigated by the always-on recency
   text and the rail pattern, not the rail hue. Verify in the live night theme.
3. Single-open is a behavior change from today's multiple-open model. The
   focus-return requirement keeps it accessible. Confirm it feels right in use.
4. Touch density at about 34 px rows. If field-tested as too tight on a phone,
   bump to 40 px (still well above today's density).
5. The condensed status chip must keep the visible stale-poll marker, since
   `StatusView` does not surface staleness.

## Non-goals

- Multi-column grid (rejected at this column width).
- A docked Inspector or Tray edit surface (deferred, a possible later revision).
- Hiding presets, the Advisor, or global settings behind a "More" popover
  (rejected for discoverability).
- Any change to conversion logic, the config schema, or the advisor behavior.
- List virtualization (a possible future step if conversion counts grow).

## Suggested build sequence

1. The dense row plus the hairline container plus the status rail, with
   single-open expansion (and its focus-return rule) and the lifted
   `ConversionDetail`. Verify density and all three themes.
2. The compact toolbar and the status chip, with search and the toggles and the
   wizard shortcut moved in. Verify sticky behavior and the non-sticky fallback
   in the live admin.
3. The three collapsed disclosures and the relocation of presets, the Advisor
   (non-lazy), and global settings.
4. Per-category Enable all and Disable all via the refactored section header and
   `setEnabledForKeys`.
5. The accessibility and keyboard pass (focus return, jump focus, badge labels,
   announcements), then the full gate and the live-admin density and theme
   verification.
