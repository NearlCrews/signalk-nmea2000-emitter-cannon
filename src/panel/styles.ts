import type { CSSProperties } from "react";

// Design tokens for the federated config panel.
//
// The panel renders inside the Signal K admin UI, which is Bootstrap 5.3 and
// flips between light and dark via `data-bs-theme` on a host element. Inline
// styles cannot read that theme, so every color here references a `--skn-*`
// CSS custom property instead of a hex literal. THEME_STYLE (below) defines
// those properties once on `.skn-panel` with explicit light values, then
// overrides them for dark mode. Surfaces are deliberately NOT derived from
// the host's `--bs-body-bg`: the admin's body background is page-gray, so a
// card that inherits it loses its white fill and blends into the page.
// Components stay theme-agnostic: they read tokens, the theme layer redefines
// them. A new hex literal in a component is a defect.
//
// Theme pinning: a `data-skn-theme` attribute on the `.skn-panel` root
// (set by ThemeToggle, persisted under localStorage key `skn-theme`) pins
// light, dark, or the red-preserving night theme regardless of the host.
// The pinned blocks share specificity (0,2,0) with the host-driven dark
// block and are emitted later in the stylesheet, so a pinned choice wins.

// Scale tokens: theme-independent, defined once on the root. Radii and font
// sizes sit on Bootstrap 5.3 defaults (radius .375rem = 6px, small text
// .875rem = 14px) so the panel reads native inside the CoreUI admin shell.
// The display size gives the wizard title and view-level headings one step of
// real contrast over the 15px card titles. Spacing runs an 8/12/16 scale so
// gutters stay on a consistent rhythm.
const SCALE_TOKENS = `
	--skn-radius: 6px;
	--skn-radius-sm: 4px;
	--skn-radius-pill: 999px;
	--skn-font-body: 14px;
	--skn-font-small: 12px;
	--skn-font-title: 15px;
	--skn-font-display: 17px;
	--skn-space-1: 8px;
	--skn-space-2: 12px;
	--skn-space-3: 16px;
`;

// Light theme. Cards must read white so they stand out from the admin's gray
// page background. Faint text is #62687a: 5.05:1 on the raised surface and
// 4.99:1 on the warn background, so it clears WCAG AA (4.5:1) everywhere it
// is used at small sizes.
// color-scheme rides along with each token block so native widgets
// (checkboxes, select dropdown lists, number spinners, scrollbars) follow the
// panel theme even when it is pinned against the host.
const LIGHT_TOKENS = `
	color-scheme: light;
	--skn-bg: #e4e5e6;
	--skn-surface: #ffffff;
	--skn-surface-muted: #f8f9fa;
	--skn-surface-raised: #f3f4f6;
	--skn-border: #e0e0e0;
	--skn-text: #333333;
	--skn-text-muted: #555555;
	--skn-text-faint: #62687a;
	--skn-accent: #3b82f6;
	--skn-accent-text: #ffffff;
	--skn-ok: #22c55e;
	--skn-wait: #f59e0b;
	--skn-off: #9ca3af;
	--skn-danger-bg: #fef2f2;
	--skn-danger-fg: #991b1b;
	--skn-danger-border: #fca5a5;
	--skn-warn-bg: #fef3c7;
	--skn-warn-fg: #78350f;
	--skn-warn-border: #fbbf24;
	--skn-success-bg: #ecfdf5;
	--skn-success-fg: #065f46;
	--skn-success-border: #6ee7b7;
	--skn-info-bg: #eef2ff;
	--skn-info-fg: #3730a3;
	--skn-info-border: #c7d2fe;
`;

// Dark theme. Faint text is #9aa1ad: 4.88:1 on the raised surface, 5.63:1 on
// the card surface, so AA holds on every dark background it appears on.
const DARK_TOKENS = `
	color-scheme: dark;
	--skn-bg: #1b1c22;
	--skn-surface: #262833;
	--skn-surface-muted: #20212b;
	--skn-surface-raised: #30323f;
	--skn-border: #3a3c4a;
	--skn-text: #e6e7ea;
	--skn-text-muted: #a3a9b5;
	--skn-text-faint: #9aa1ad;
	--skn-accent: #4c93ff;
	--skn-accent-text: #ffffff;
	--skn-ok: #2dd4a0;
	--skn-wait: #fbbf24;
	--skn-off: #6b7785;
	--skn-danger-bg: #3a1a1a;
	--skn-danger-fg: #f5a3a3;
	--skn-danger-border: #7a3a3a;
	--skn-warn-bg: #3a2f12;
	--skn-warn-fg: #f5d28a;
	--skn-warn-border: #6b551f;
	--skn-success-bg: #12352a;
	--skn-success-fg: #7fe3c0;
	--skn-success-border: #2f6b54;
	--skn-info-bg: #1e2547;
	--skn-info-fg: #a9b6f0;
	--skn-info-border: #3a4577;
`;

// Night theme: red-preserving for night vision at the helm. Near-black
// surfaces, every text and accent token collapses into the desaturated red
// and amber families, nothing renders blue, green, or white. Contrast checked
// against the night surfaces: text 7.25:1, muted 5.13:1, faint 4.56:1 worst
// case, every status fg 5.65:1 or better on its paired bg.
const NIGHT_TOKENS = `
	color-scheme: dark;
	--skn-bg: #0d0606;
	--skn-surface: #160a0a;
	--skn-surface-muted: #110808;
	--skn-surface-raised: #1f0e0e;
	--skn-border: #3a1616;
	--skn-text: #e08a8a;
	--skn-text-muted: #b87474;
	--skn-text-faint: #ad6c6c;
	--skn-accent: #cf6a3c;
	--skn-accent-text: #1a0808;
	--skn-ok: #cf8a4a;
	--skn-wait: #a9742e;
	--skn-off: #7a4f4f;
	--skn-danger-bg: #2a0d0d;
	--skn-danger-fg: #e07a6a;
	--skn-danger-border: #6e2a2a;
	--skn-warn-bg: #241204;
	--skn-warn-fg: #d9a05a;
	--skn-warn-border: #6e4a1f;
	--skn-success-bg: #1d0f08;
	--skn-success-fg: #cf8a5a;
	--skn-success-border: #6e3f1f;
	--skn-info-bg: #200c0c;
	--skn-info-fg: #c98080;
	--skn-info-border: #5e2a2a;
`;

// Injected once by PluginConfigurationPanel. Covers the token contract, the
// host-driven dark overrides, the pinned theme blocks, and the :focus-visible
// ring (inline styles cannot express pseudo-classes). Order matters: the
// pinned `[data-skn-theme]` blocks come after the host-driven dark block so
// an explicit user choice outranks the host theme at equal specificity.
export const THEME_STYLE = `
.skn-panel {
${SCALE_TOKENS}${LIGHT_TOKENS}}
[data-bs-theme="dark"] .skn-panel,
.dark-mode .skn-panel {
${DARK_TOKENS}}
.skn-panel[data-skn-theme="light"] {
${LIGHT_TOKENS}}
.skn-panel[data-skn-theme="dark"] {
${DARK_TOKENS}}
.skn-panel[data-skn-theme="night"] {
${NIGHT_TOKENS}}
.skn-panel input:focus-visible,
.skn-panel select:focus-visible,
.skn-panel button:focus-visible {
	outline: 2px solid var(--skn-accent);
	outline-offset: 1px;
}
/* Buttons set their background as an inline style, which outranks the
   browser's default disabled appearance, so a disabled button would still
   look enabled. !important is required to override the inline style for the
   disabled state. */
.skn-panel button:disabled {
	background: var(--skn-surface-raised) !important;
	color: var(--skn-text-faint) !important;
	border-color: var(--skn-border) !important;
	cursor: not-allowed !important;
}
/* Pointer feedback. Inline styles cannot express :hover or :active, so the
   interactive elements get a shared brightness response here: a touch darker
   on hover, darker still while pressed, with a short transition so the shift
   reads as a response rather than a flicker. Disabled buttons opt out. Only
   buttons transition filter: inputs and selects never receive one. */
.skn-panel input,
.skn-panel select {
	transition:
		background-color 120ms ease,
		border-color 120ms ease;
}
.skn-panel button {
	transition:
		background-color 120ms ease,
		border-color 120ms ease,
		filter 120ms ease;
}
.skn-panel button:hover:not(:disabled) {
	filter: brightness(0.96);
}
.skn-panel button:active:not(:disabled) {
	filter: brightness(0.9);
}
/* Inputs and selects inside mapping-table cells flex with the column instead
   of holding the fixed 220px of S.input / S.select, so the table fits a phone
   without forcing horizontal scroll. min-width keeps each field usable when
   columns compress. !important is required because the base S.input and
   S.select widths arrive as inline styles, which outrank this rule. */
.skn-panel td input:not([type="checkbox"]),
.skn-panel td select {
	width: 100% !important;
	min-width: 120px !important;
	box-sizing: border-box !important;
}
.skn-panel { --skn-toolbar-height: 52px; }
.skn-toolbar { position: sticky; top: 0; z-index: 2; }
.skn-row { scroll-margin-top: var(--skn-toolbar-height); }
.skn-row:hover { filter: brightness(0.97); }
`;

export const S: Record<string, CSSProperties> = {
	// The root paints --skn-bg itself: a pinned Dark or Night theme must read
	// as one continuous surface, not dark cards floating on the host's light
	// page (and the sticky footer reuses the same background).
	root: {
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		color: "var(--skn-text)",
		background: "var(--skn-bg)",
		padding: "var(--skn-space-3)",
		borderRadius: "var(--skn-radius)",
	},
	statusBar: {
		display: "flex",
		flexWrap: "wrap",
		gap: "var(--skn-space-3)",
		padding: "var(--skn-space-2) var(--skn-space-3)",
		background: "var(--skn-surface-muted)",
		border: "1px solid var(--skn-border)",
		borderRadius: "var(--skn-radius)",
		marginBottom: "var(--skn-space-3)",
		alignItems: "center",
		fontSize: "var(--skn-font-body)",
	},
	dot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
	dotOk: { background: "var(--skn-ok)" },
	dotWait: { background: "var(--skn-wait)" },
	dotOff: { background: "var(--skn-off)" },
	statLabel: { color: "var(--skn-text-muted)" },
	statValue: { fontWeight: 600, marginLeft: 4 },
	errorBadge: {
		background: "var(--skn-danger-bg)",
		color: "var(--skn-danger-fg)",
		border: "1px solid var(--skn-danger-border)",
		padding: "2px 8px",
		borderRadius: "var(--skn-radius-sm)",
		fontSize: "var(--skn-font-small)",
	},
};

// Error badge rendered as a real button (jump to first error). Inherits the
// badge palette and adds button resets plus a pointer cursor.
S.errorBadgeButton = {
	...S.errorBadge,
	cursor: "pointer",
	font: "inherit",
};

// Small (12px) semantic text utilities. Components spread these and add only
// layout tweaks (margins), so the small-text color treatments live in one
// place instead of being re-declared per component.
S.textSmallMuted = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
};
S.textSmallFaint = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-faint)",
};
S.textSmallSuccess = {
	fontSize: "var(--skn-font-small)",
	fontWeight: 600,
	color: "var(--skn-success-fg)",
};
S.textSmallDanger = {
	fontSize: "var(--skn-font-small)",
	fontWeight: 600,
	color: "var(--skn-danger-fg)",
};
// Color-only utilities for cells that already carry their own font size
// (e.g. the status table cells).
S.textFaint = { color: "var(--skn-text-faint)" };
S.textDanger = { color: "var(--skn-danger-fg)" };
// Danger count badge in a section header, sitting after the muted count text.
S.sectionErrorCount = { ...S.textSmallDanger, marginLeft: 6 };
// Danger count pill on a category tab. Inline-block so it sits after the count.
S.tabErrorDot = {
	display: "inline-block",
	minWidth: 16,
	marginLeft: 6,
	padding: "0 5px",
	borderRadius: "var(--skn-radius-pill)",
	background: "var(--skn-danger-fg)",
	color: "var(--skn-surface)",
	fontSize: "var(--skn-font-small)",
	fontWeight: 700,
	lineHeight: "16px",
	textAlign: "center",
};
S.fieldRow = {
	display: "flex",
	alignItems: "center",
	gap: "var(--skn-space-2)",
	marginBottom: "var(--skn-space-1)",
	flexWrap: "wrap",
};
// flex-basis 280 with shrink allowed: labels align in a column on wide
// screens but give the space back on tablets instead of forcing a dead
// gutter beside short labels.
S.label = {
	fontSize: "var(--skn-font-body)",
	color: "var(--skn-text-muted)",
	flex: "0 1 280px",
};
S.select = {
	padding: "6px 10px",
	borderRadius: "var(--skn-radius)",
	border: "1px solid var(--skn-border)",
	background: "var(--skn-surface)",
	color: "var(--skn-text)",
	fontSize: "var(--skn-font-body)",
	minWidth: 220,
};
S.input = {
	padding: "6px 10px",
	borderRadius: "var(--skn-radius)",
	border: "1px solid var(--skn-border)",
	background: "var(--skn-surface)",
	color: "var(--skn-text)",
	fontSize: "var(--skn-font-body)",
	width: 220,
};
S.card = {
	background: "var(--skn-surface)",
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	padding: "var(--skn-space-2) var(--skn-space-3)",
	marginBottom: "var(--skn-space-2)",
};
S.cardHeader = {
	display: "flex",
	alignItems: "center",
	gap: "var(--skn-space-2)",
	marginBottom: 0,
	flexWrap: "wrap",
};
// 22px hit area for marine use: a 16px checkbox is too small for wet fingers
// on a moving boat. accentColor keeps the checked fill on the token palette.
S.checkbox = {
	width: 22,
	height: 22,
	flexShrink: 0,
	cursor: "pointer",
	accentColor: "var(--skn-accent)",
};
S.cardMeta = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-faint)",
};
S.tabs = {
	display: "flex",
	flexWrap: "wrap",
	gap: 4,
	borderBottom: "1px solid var(--skn-border)",
	marginBottom: "var(--skn-space-2)",
};
S.tab = {
	padding: "8px 14px",
	minHeight: 36,
	background: "transparent",
	border: "none",
	borderBottom: "2px solid transparent",
	cursor: "pointer",
	fontSize: "var(--skn-font-body)",
	color: "var(--skn-text-muted)",
};
S.tabActive = {
	borderBottom: "2px solid var(--skn-accent)",
	color: "var(--skn-accent)",
	fontWeight: 600,
};
S.tabCount = { color: "var(--skn-text-faint)" };
// Sticky action bar pinned to the bottom of the viewport so Save, Discard, and
// the dirty indicator stay reachable above a long card list. The panel
// background fills behind it so cards scrolling underneath do not show
// through, and the top border reads it as a distinct bar.
S.footer = {
	position: "sticky",
	bottom: 0,
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: "var(--skn-space-1)",
	padding: "var(--skn-space-2) 0",
	borderTop: "1px solid var(--skn-border)",
	marginTop: "var(--skn-space-3)",
	background: "var(--skn-bg)",
	zIndex: 5,
};
// Wrapper around the save-status indicator in the footer. Focusable
// (tabIndex -1) but not in the tab order, so Save and Discard can move focus
// here after they disable themselves instead of dropping it to <body>.
S.saveStatusFocus = {
	display: "inline-flex",
	alignItems: "center",
	outline: "none",
};
S.btnPrimary = {
	padding: "8px 16px",
	minHeight: 36,
	background: "var(--skn-accent)",
	color: "var(--skn-accent-text)",
	border: "none",
	borderRadius: "var(--skn-radius)",
	fontWeight: 600,
	cursor: "pointer",
};
S.btnSecondary = {
	padding: "8px 16px",
	minHeight: 36,
	background: "var(--skn-surface-raised)",
	color: "var(--skn-text)",
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	cursor: "pointer",
};
S.btnDestructive = {
	padding: "8px 16px",
	minHeight: 36,
	background: "var(--skn-surface)",
	color: "var(--skn-danger-fg)",
	border: "1px solid var(--skn-danger-border)",
	borderRadius: "var(--skn-radius)",
	cursor: "pointer",
};
// Compact destructive button sized for table rows. Smaller text than the
// full-size S.btnDestructive but the same 36px minimum hit area: touch
// targets do not shrink just because the surrounding cells are compact.
S.btnDestructiveSm = {
	...S.btnDestructive,
	padding: "6px 12px",
	fontSize: "var(--skn-font-small)",
};
// Compact secondary button (e.g. the advisor connection-test buttons), sized
// to sit on the same row as a 6px-padded input without towering over it.
S.btnSecondarySm = {
	...S.btnSecondary,
	padding: "6px 12px",
	fontSize: "var(--skn-font-small)",
};
// Armed confirm state for the table-row Remove button: inverted danger
// colors so the second, destructive tap is visually unmistakable.
S.btnDestructiveSmArmed = {
	...S.btnDestructiveSm,
	background: "var(--skn-danger-fg)",
	color: "var(--skn-surface)",
	borderColor: "var(--skn-danger-fg)",
	fontWeight: 600,
};
S.dirty = {
	color: "var(--skn-warn-fg)",
	fontSize: "var(--skn-font-small)",
	marginLeft: 8,
};
S.cardTitle = {
	fontSize: "var(--skn-font-title)",
	fontWeight: 600,
	flex: 1,
	minWidth: 180,
	margin: 0,
	color: "var(--skn-text)",
};
S.cardPurpose = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	margin: "2px 0 6px",
};
// Shared shape for the small inline card badges (compatibility, legacy).
// Each badge spreads this and adds its own colors and modifiers.
const badgeBase: CSSProperties = {
	display: "inline-block",
	fontSize: "var(--skn-font-small)",
	padding: "1px 6px",
	borderRadius: "var(--skn-radius-sm)",
};
S.cardCompatibility = {
	...badgeBase,
	marginLeft: 8,
	fontWeight: 500,
};
// Neutral palette on purpose: "Legacy" is a fact, not a warning, and a
// colored badge on every legacy card would compete with real status badges.
S.cardLegacy = {
	...badgeBase,
	marginLeft: 8,
	fontWeight: 500,
	background: "var(--skn-surface-raised)",
	color: "var(--skn-text-muted)",
	border: "1px solid var(--skn-border)",
	cursor: "help",
};
// Applied to each PGN number inside the card title so the existing
// "(PGN NNNNN)" text is itself the per-PGN tooltip target.
S.pgnHover = {
	cursor: "help",
	textDecoration: "underline dotted",
	textUnderlineOffset: 2,
};
S.helpHint = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	margin: "2px 0 6px",
};
S.notePrefix = {
	fontWeight: 600,
	marginRight: 4,
};
S.note = {
	background: "var(--skn-warn-bg)",
	border: "1px solid var(--skn-warn-border)",
	borderRadius: "var(--skn-radius-sm)",
	color: "var(--skn-warn-fg)",
	fontSize: "var(--skn-font-small)",
	lineHeight: 1.45,
	margin: "8px 0 6px",
	padding: "6px 8px",
};
// Informational note (e.g. a conversion's usage note in the expanded card
// body). Info palette, not amber: amber is reserved for genuine cautions.
S.noteInfo = {
	...S.note,
	background: "var(--skn-info-bg)",
	border: "1px solid var(--skn-info-border)",
	color: "var(--skn-info-fg)",
};
S.errorMark = { color: "var(--skn-danger-fg)", fontSize: 14, fontWeight: 700 };
S.loadingText = {
	color: "var(--skn-text-muted)",
	fontSize: "var(--skn-font-body)",
};
S.savedPill = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	fontSize: "var(--skn-font-small)",
	lineHeight: 1,
	color: "var(--skn-success-fg)",
	background: "var(--skn-success-bg)",
	border: "1px solid var(--skn-success-border)",
	borderRadius: "var(--skn-radius-pill)",
	padding: "5px 12px",
	marginLeft: 8,
};
S.errorBanner = {
	color: "var(--skn-danger-fg)",
	background: "var(--skn-danger-bg)",
	border: "1px solid var(--skn-danger-border)",
	borderRadius: "var(--skn-radius)",
	padding: "8px 12px",
	fontSize: "var(--skn-font-body)",
	margin: "8px 0",
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: 12,
};
S.btnRetry = {
	padding: "6px 12px",
	minHeight: 36,
	background: "var(--skn-surface)",
	color: "var(--skn-danger-fg)",
	border: "1px solid var(--skn-danger-border)",
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-small)",
	cursor: "pointer",
};
S.visuallyHidden = {
	position: "absolute",
	width: 1,
	height: 1,
	padding: 0,
	margin: -1,
	overflow: "hidden",
	clip: "rect(0,0,0,0)",
	whiteSpace: "nowrap",
	border: 0,
};
S.chipRow = {
	display: "flex",
	gap: "var(--skn-space-1)",
	flexWrap: "wrap",
	marginBottom: "var(--skn-space-3)",
};
S.chip = {
	padding: "6px 12px",
	minHeight: 36,
	background: "var(--skn-info-bg)",
	color: "var(--skn-info-fg)",
	border: "1px solid var(--skn-info-border)",
	borderRadius: "var(--skn-radius-pill)",
	fontSize: "var(--skn-font-small)",
	fontWeight: 500,
	cursor: "pointer",
};

// Segmented control (the theme toggle and the Configure / Status view
// switcher). Buttons share a bordered pill-less container; the active segment
// fills with the accent. 36px segments for marine touch use.
S.segmented = {
	display: "inline-flex",
	// Rendered as a <fieldset>: zero out the user-agent margin and padding
	// so the segments sit flush inside the border.
	margin: 0,
	padding: 0,
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	overflow: "hidden",
	background: "var(--skn-surface)",
};
S.segmentedBtn = {
	padding: "6px 12px",
	minHeight: 36,
	background: "transparent",
	color: "var(--skn-text-muted)",
	border: "none",
	fontSize: "var(--skn-font-small)",
	cursor: "pointer",
};
S.segmentedBtnActive = {
	...S.segmentedBtn,
	background: "var(--skn-accent)",
	color: "var(--skn-accent-text)",
	fontWeight: 600,
};

// Generic disclosure styles: the borderless caret-toggle header button and
// its body, shared via the Disclosure component (Global settings, Config
// Advisor, Advisor settings). The remaining advisor* styles cover the
// auto-applied / pending result blocks and the per-item approve/reject
// controls, all on the existing panel palette.
S.disclosureToggle = {
	display: "flex",
	alignItems: "center",
	gap: 8,
	width: "100%",
	minHeight: 36,
	background: "none",
	border: "none",
	padding: 0,
	fontSize: 14,
	fontWeight: 600,
	color: "var(--skn-text)",
	cursor: "pointer",
	textAlign: "left",
};
S.disclosureBody = { marginTop: 10 };
// Vertical gap between the advisor's stacked blocks (result area, settings
// disclosure). Named for its own purpose so these spacers do not borrow the
// disclosure-body token while sitting outside any Disclosure.
S.advisorStackGap = { marginTop: 10 };
S.advisorIntro = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	margin: "0 0 10px",
};
S.advisorAutoBlock = {
	background: "var(--skn-success-bg)",
	border: "1px solid var(--skn-success-border)",
	borderRadius: "var(--skn-radius)",
	padding: "10px 12px",
	marginBottom: 8,
};
S.advisorPendingBlock = {
	background: "var(--skn-warn-bg)",
	border: "1px solid var(--skn-warn-border)",
	borderRadius: "var(--skn-radius)",
	padding: "10px 12px",
	marginBottom: 8,
};
S.advisorBlockTitle = {
	fontWeight: 600,
	fontSize: "var(--skn-font-body)",
	color: "var(--skn-text)",
};
S.advisorList = {
	margin: "6px 0 0",
	paddingLeft: 18,
	fontSize: "var(--skn-font-body)",
};
S.advisorRow = {
	borderTop: "1px solid var(--skn-warn-border)",
	paddingTop: 8,
	marginTop: 8,
};
S.advisorRowHead = {
	display: "flex",
	alignItems: "center",
	gap: 8,
	flexWrap: "wrap",
};
S.advisorRowKey = {
	fontWeight: 600,
	fontSize: "var(--skn-font-body)",
	flex: 1,
	minWidth: 140,
};
S.advisorReason = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	marginTop: 4,
};
S.advisorNote = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-faint)",
	marginTop: 6,
};
S.btnApprove = {
	padding: "6px 12px",
	minHeight: 36,
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-small)",
	cursor: "pointer",
	background: "var(--skn-surface)",
	color: "var(--skn-success-fg)",
	border: "1px solid var(--skn-success-border)",
};
S.btnApproveActive = {
	...S.btnApprove,
	background: "var(--skn-success-fg)",
	color: "var(--skn-surface)",
};
S.btnReject = {
	padding: "6px 12px",
	minHeight: 36,
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-small)",
	cursor: "pointer",
	background: "var(--skn-surface)",
	color: "var(--skn-danger-fg)",
	border: "1px solid var(--skn-danger-border)",
};
S.btnRejectActive = {
	...S.btnReject,
	background: "var(--skn-danger-fg)",
	color: "var(--skn-surface)",
};
S.advisorSubhead = {
	fontSize: "var(--skn-font-body)",
	fontWeight: 600,
	color: "var(--skn-text)",
	margin: "12px 0 4px",
};
S.tableWrap = { overflowX: "auto" };
S.table = {
	width: "100%",
	borderCollapse: "collapse",
	fontSize: "var(--skn-font-body)",
	color: "var(--skn-text)",
};
S.tableHeadRow = { textAlign: "left", color: "var(--skn-text-muted)" };
S.tableTitle = {
	fontSize: "var(--skn-font-body)",
	fontWeight: 600,
	marginBottom: 4,
	color: "var(--skn-text)",
};
S.tableCell = { padding: 6 };
// Actions column: extra left padding keeps the destructive Remove button
// clear of the editable cells so a wet-finger tap cannot straddle both.
S.tableActionCell = { padding: 6, paddingLeft: 16 };
S.tableHeadCell = { padding: 6, fontWeight: 500 };
// Collapsible Modern / Legacy section: a disclosure header and a body of
// conversion cards.
S.section = { marginBottom: 10 };
S.sectionHeader = {
	display: "flex",
	alignItems: "center",
	gap: 8,
	width: "100%",
	padding: "10px 12px",
	background: "var(--skn-surface-muted)",
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	cursor: "pointer",
	fontSize: "var(--skn-font-body)",
	fontWeight: 600,
	color: "var(--skn-text)",
	textAlign: "left",
};
// Shared by every disclosure control.
S.disclosureCaret = {
	color: "var(--skn-text-faint)",
	fontSize: 11,
	flexShrink: 0,
};
S.sectionCount = {
	fontWeight: 400,
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
};
S.sectionBody = { marginTop: 8 };
// Collapsible conversion card: the chevron + title form a disclosure button;
// the checkbox and badges sit outside it so they stay independently usable.
S.cardDisclosure = {
	display: "flex",
	alignItems: "center",
	gap: 8,
	flex: 1,
	minWidth: 180,
	padding: 0,
	background: "transparent",
	border: "none",
	cursor: "pointer",
	font: "inherit",
	textAlign: "left",
};
S.cardBody = { marginTop: 8 };

// Top control row: the Configure / Status view toggle on the left, the theme
// toggle on the right. Both are SegmentedControl instances (S.segmented*).
S.controlBar = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	flexWrap: "wrap",
	gap: "var(--skn-space-1)",
	marginBottom: "var(--skn-space-2)",
};
// Right-hand cluster of the control bar.
S.controlBarGroup = {
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: "var(--skn-space-1)",
};

// Catalog search: a filter input with a sibling Clear button (kept a real
// 36px button rather than an overlay so it stays a full touch target).
S.searchRow = {
	display: "flex",
	alignItems: "center",
	gap: "var(--skn-space-1)",
	marginBottom: "var(--skn-space-2)",
};
S.searchInput = {
	flex: 1,
	minWidth: 0,
	minHeight: 36,
	boxSizing: "border-box",
	padding: "8px 12px",
	borderRadius: "var(--skn-radius)",
	border: "1px solid var(--skn-border)",
	background: "var(--skn-surface)",
	color: "var(--skn-text)",
	fontSize: "var(--skn-font-body)",
};
S.searchClear = {
	minHeight: 36,
	minWidth: 36,
	padding: "6px 12px",
	background: "var(--skn-surface-raised)",
	color: "var(--skn-text)",
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	cursor: "pointer",
	fontSize: "var(--skn-font-small)",
};
S.searchSummary = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
	margin: "0 0 8px",
};

// First-run callout: shown above the catalog when nothing is emitting yet.
// Info-colored so it reads as guidance, not an error.
S.calloutFirstRun = {
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: 12,
	background: "var(--skn-info-bg)",
	border: "1px solid var(--skn-info-border)",
	color: "var(--skn-info-fg)",
	borderRadius: "var(--skn-radius)",
	padding: "12px 16px",
	margin: "0 0 16px",
	fontSize: "var(--skn-font-body)",
	lineHeight: 1.45,
};
S.calloutText = { flex: 1, minWidth: 220 };

// Small count pill (e.g. the advisor pending-decision badge on its header).
S.countPill = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	minWidth: 20,
	padding: "1px 8px",
	borderRadius: "var(--skn-radius-pill)",
	background: "var(--skn-warn-bg)",
	color: "var(--skn-warn-fg)",
	border: "1px solid var(--skn-warn-border)",
	fontSize: "var(--skn-font-small)",
	fontWeight: 600,
};

// First-run setup wizard: a modal dialog over a dimmed overlay. The dimmed
// backdrop is a real <button> (S.wizardBackdrop) so click-to-close has native
// keyboard semantics; the dialog sits above it via position/zIndex.
S.wizardOverlay = {
	position: "fixed",
	inset: 0,
	display: "flex",
	alignItems: "flex-start",
	justifyContent: "center",
	padding: "24px 16px",
	overflowY: "auto",
	zIndex: 1000,
};
S.wizardBackdrop = {
	position: "fixed",
	inset: 0,
	margin: 0,
	padding: 0,
	border: "none",
	background: "rgba(0, 0, 0, 0.5)",
	cursor: "pointer",
};
S.wizardDialog = {
	position: "relative",
	zIndex: 1,
	display: "flex",
	flexDirection: "column",
	width: "100%",
	maxWidth: 680,
	maxHeight: "calc(100vh - 48px)",
	overflow: "hidden",
	background: "var(--skn-surface)",
	color: "var(--skn-text)",
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	boxShadow: "0 10px 40px rgba(0, 0, 0, 0.35)",
};
S.wizardHeader = {
	display: "flex",
	alignItems: "center",
	gap: 12,
	padding: "16px 20px",
	borderBottom: "1px solid var(--skn-border)",
};
S.wizardTitle = {
	flex: 1,
	margin: 0,
	fontSize: "var(--skn-font-display)",
	fontWeight: 600,
	color: "var(--skn-text)",
};
S.wizardClose = {
	minWidth: 36,
	minHeight: 36,
	background: "var(--skn-surface-raised)",
	color: "var(--skn-text)",
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	cursor: "pointer",
	fontSize: 18,
	lineHeight: 1,
};
S.wizardBody = { padding: "16px 20px", overflowY: "auto" };
S.wizardIntro = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	margin: "0 0 12px",
};
S.wizardFooter = {
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: 8,
	padding: "12px 20px",
	borderTop: "1px solid var(--skn-border)",
};
S.wizardFooterHint = {
	flex: 1,
	minWidth: 200,
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
	lineHeight: 1.4,
};
S.wizardGroup = { marginBottom: 16 };
S.wizardGroupTitle = {
	fontSize: "var(--skn-font-body)",
	fontWeight: 600,
	margin: "0 0 6px",
	color: "var(--skn-text)",
};
// Whole row is a <label> so tapping the text toggles the checkbox. 40px tall
// so the touch target clears its neighbours in the list.
S.wizardRow = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	minHeight: 40,
	padding: "4px 0",
	cursor: "pointer",
};
S.wizardRowText = {
	fontSize: "var(--skn-font-body)",
	color: "var(--skn-text)",
};
S.wizardSubhead = {
	fontSize: "var(--skn-font-body)",
	fontWeight: 600,
	color: "var(--skn-text)",
	margin: "16px 0 4px",
};

// Dense conversion list: one bordered surface, hairline row dividers, no
// per-row box or gap. Replaces the boxed-card stack.
S.rowList = {
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	background: "var(--skn-surface)",
	overflow: "hidden",
};
// Outer container carries the bottom divider and the left rail. RAIL_STYLE
// overrides the border-left color and style; nothing else should set them here.
S.rowOuter = {
	borderBottom: "1px solid var(--skn-border)",
	borderLeft: "3px solid transparent",
};
// Inner header row: only the flex layout. The divider and rail live on
// S.rowOuter so the expanded ConversionDetail renders full-width below the
// header without being squeezed into the flex line.
S.row = {
	display: "flex",
	alignItems: "center",
	gap: "var(--skn-space-1)",
	padding: "4px var(--skn-space-2)",
	minHeight: 34,
	cursor: "pointer",
};
// Rail treatments. Emitting is a solid rail; silent is a hollow rail (a dotted
// border-left) so emitting and silent differ by pattern, not only by a hue that
// collides in the night theme. Error uses the danger foreground; disabled has
// no rail.
S.rowRailEmitting = {
	borderLeftColor: "var(--skn-ok)",
	borderLeftStyle: "solid",
};
S.rowRailSilent = {
	borderLeftColor: "var(--skn-wait)",
	borderLeftStyle: "dotted",
};
S.rowRailError = {
	borderLeftColor: "var(--skn-danger-fg)",
	borderLeftStyle: "solid",
};
S.rowRailDisabled = { borderLeftColor: "transparent" };
S.rowMain = {
	display: "flex",
	alignItems: "center",
	gap: "var(--skn-space-1)",
	flex: 1,
	minWidth: 0,
};
S.rowTitleWrap = {
	display: "flex",
	alignItems: "baseline",
	flex: 1,
	minWidth: 0,
};
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
S.rowPgn = {
	color: "var(--skn-text-muted)",
	whiteSpace: "nowrap",
	flex: "0 0 auto",
};
// Fixed-width reserved slot so a badge-less row does not shift the recency column.
S.rowBadgeSlot = {
	width: 16,
	flexShrink: 0,
	textAlign: "center",
	display: "inline-flex",
	justifyContent: "center",
};
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
S.disclosureHeaderRow = {
	display: "flex",
	alignItems: "center",
	gap: "var(--skn-space-1)",
};
