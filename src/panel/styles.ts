import type { CSSProperties } from "react";

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
	statValue: { fontWeight: 600, marginLeft: "var(--skn-space-half)" },
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
S.sectionErrorCount = {
	...S.textSmallDanger,
	marginLeft: "var(--skn-space-compact)",
};
// Danger count pill on a category tab. Inline-block so it sits after the count.
S.tabErrorDot = {
	display: "inline-block",
	minWidth: 16,
	marginLeft: "var(--skn-space-compact)",
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
	padding: "var(--skn-field-padding)",
	borderRadius: "var(--skn-radius)",
	border: "1px solid var(--skn-border)",
	background: "var(--skn-surface)",
	color: "var(--skn-text)",
	fontSize: "var(--skn-font-body)",
	minWidth: 220,
};
S.input = {
	padding: "var(--skn-field-padding)",
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
	gap: "var(--skn-space-half)",
	borderBottom: "1px solid var(--skn-border)",
	marginBottom: "var(--skn-space-2)",
};
S.tab = {
	padding: "8px 14px",
	minHeight: "var(--skn-control-height)",
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
	minHeight: "var(--skn-control-height)",
	background: "var(--skn-accent)",
	color: "var(--skn-accent-text)",
	border: "none",
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-body)",
	fontWeight: 600,
	cursor: "pointer",
};
S.btnSecondary = {
	padding: "8px 16px",
	minHeight: "var(--skn-control-height)",
	background: "var(--skn-surface-raised)",
	color: "var(--skn-text)",
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-body)",
	cursor: "pointer",
};
S.btnDestructive = {
	padding: "8px 16px",
	minHeight: "var(--skn-control-height)",
	background: "var(--skn-surface)",
	color: "var(--skn-danger-fg)",
	border: "1px solid var(--skn-danger-border)",
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-body)",
	cursor: "pointer",
};
// Compact destructive button sized for table rows. Smaller text than the
// full-size S.btnDestructive but the same 36px minimum hit area: touch
// targets do not shrink just because the surrounding cells are compact.
S.btnDestructiveSm = {
	...S.btnDestructive,
	padding: "var(--skn-control-padding)",
	fontSize: "var(--skn-font-small)",
};
// Compact secondary button (e.g. the advisor connection-test buttons), sized
// to sit on the same row as a 6px-padded input without towering over it.
S.btnSecondarySm = {
	...S.btnSecondary,
	padding: "var(--skn-control-padding)",
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
S.cardPurpose = {
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	margin: "2px 0 6px",
};
// Shared shape for the small inline legacy badge.
const badgeBase: CSSProperties = {
	display: "inline-block",
	fontSize: "var(--skn-font-small)",
	padding: "1px 6px",
	borderRadius: "var(--skn-radius-sm)",
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
	gap: "var(--skn-space-2)",
};
S.btnRetry = {
	padding: "var(--skn-control-padding)",
	minHeight: "var(--skn-control-height)",
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
	padding: "var(--skn-control-padding)",
	minHeight: "var(--skn-control-height)",
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
	flexShrink: 0,
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
	padding: "var(--skn-control-padding)",
	minHeight: "var(--skn-control-height)",
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
	gap: "var(--skn-space-1)",
	width: "100%",
	minHeight: "var(--skn-control-height)",
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
// Collapsible Modern / Legacy section: a disclosure header and a body of
// conversion cards.
S.section = { marginBottom: 10 };
S.sectionHeader = {
	display: "flex",
	alignItems: "center",
	gap: "var(--skn-space-1)",
	flex: 1,
	minWidth: 0,
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
S.cardBody = { marginTop: 8 };

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
	gap: "var(--skn-space-2)",
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

// Small secondary button for Enable all / Disable all on a section header.
// Enable all / Disable all: the panel's small secondary button (raised fill,
// border, and radius) so they read as real buttons, not hairline boxes, plus
// nowrap and no-shrink so the two-word labels never wrap or get squeezed.
S.bulkBtn = {
	...S.btnSecondarySm,
	whiteSpace: "nowrap",
	flexShrink: 0,
};
// Header row that holds the disclosure toggle plus trailing sibling controls.
S.disclosureHeaderRow = {
	display: "flex",
	alignItems: "center",
	gap: "var(--skn-space-1)",
};
