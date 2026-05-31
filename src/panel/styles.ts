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

// Injected once by PluginConfigurationPanel. Covers the token contract, the
// dark-mode overrides, and the :focus-visible ring (inline styles cannot
// express pseudo-classes).
export const THEME_STYLE = `
.skn-panel {
	/* Surfaces and text: explicit light-mode values. Cards must read white
	   so they stand out from the admin's gray page background. The dark
	   block below replaces every one of these. */
	--skn-bg: #e4e5e6;
	--skn-surface: #ffffff;
	--skn-surface-muted: #f8f9fa;
	--skn-surface-raised: #f3f4f6;
	--skn-border: #e0e0e0;
	--skn-text: #333333;
	--skn-text-muted: #555555;
	--skn-text-faint: #888888;
	/* Accents. Light defaults; the dark block below brightens them. */
	--skn-accent: #3b82f6;
	--skn-accent-text: #ffffff;
	--skn-ok: #22c55e;
	--skn-wait: #f59e0b;
	--skn-off: #9ca3af;
	/* Status / semantic surfaces, each a paired bg + fg + border. */
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
	--skn-legacy-bg: #ede9fe;
	--skn-legacy-fg: #5b21b6;
	--skn-legacy-border: #c4b5fd;
}
[data-bs-theme="dark"] .skn-panel,
.dark-mode .skn-panel {
	--skn-bg: #1b1c22;
	--skn-surface: #262833;
	--skn-surface-muted: #20212b;
	--skn-surface-raised: #30323f;
	--skn-border: #3a3c4a;
	--skn-text: #e6e7ea;
	--skn-text-muted: #a3a9b5;
	--skn-text-faint: #7c8290;
	--skn-accent: #4c93ff;
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
	--skn-legacy-bg: #2a2245;
	--skn-legacy-fg: #c4b5fd;
	--skn-legacy-border: #4a3f77;
}
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
`;

export const S: Record<string, CSSProperties> = {
	root: {
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		color: "var(--skn-text)",
		padding: "16px 0",
	},
	statusBar: {
		display: "flex",
		flexWrap: "wrap",
		gap: 18,
		padding: "12px 16px",
		background: "var(--skn-surface-muted)",
		border: "1px solid var(--skn-border)",
		borderRadius: 10,
		marginBottom: 16,
		alignItems: "center",
		fontSize: 13,
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
		borderRadius: 4,
		fontSize: 12,
	},
};

S.fieldRow = {
	display: "flex",
	alignItems: "center",
	gap: 12,
	marginBottom: 8,
	flexWrap: "wrap",
};
S.label = {
	fontSize: 13,
	color: "var(--skn-text-muted)",
	width: 280,
	flexShrink: 0,
};
S.select = {
	padding: "6px 10px",
	borderRadius: 6,
	border: "1px solid var(--skn-border)",
	background: "var(--skn-surface)",
	color: "var(--skn-text)",
	fontSize: 13,
	minWidth: 220,
};
S.input = {
	padding: "6px 10px",
	borderRadius: 6,
	border: "1px solid var(--skn-border)",
	background: "var(--skn-surface)",
	color: "var(--skn-text)",
	fontSize: 13,
	width: 220,
};
S.card = {
	background: "var(--skn-surface)",
	border: "1px solid var(--skn-border)",
	borderRadius: 10,
	padding: "12px 16px",
	marginBottom: 10,
};
S.cardHeader = {
	display: "flex",
	alignItems: "center",
	gap: 12,
	marginBottom: 0,
	flexWrap: "wrap",
};
S.checkbox = { width: 16, height: 16, flexShrink: 0, cursor: "pointer" };
S.cardMeta = { fontSize: 11, color: "var(--skn-text-faint)" };
S.tabs = {
	display: "flex",
	flexWrap: "wrap",
	gap: 4,
	borderBottom: "1px solid var(--skn-border)",
	marginBottom: 12,
};
S.tab = {
	padding: "8px 14px",
	background: "transparent",
	border: "none",
	borderBottom: "2px solid transparent",
	cursor: "pointer",
	fontSize: 13,
	color: "var(--skn-text-muted)",
};
S.tabActive = {
	borderBottom: "2px solid var(--skn-accent)",
	color: "var(--skn-accent)",
	fontWeight: 600,
};
S.tabCount = { color: "var(--skn-text-faint)" };
S.footer = {
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: 8,
	padding: "12px 0",
	borderTop: "1px solid var(--skn-border)",
	marginTop: 16,
};
S.btnPrimary = {
	padding: "8px 16px",
	background: "var(--skn-accent)",
	color: "var(--skn-accent-text)",
	border: "none",
	borderRadius: 6,
	fontWeight: 600,
	cursor: "pointer",
};
S.btnSecondary = {
	padding: "8px 16px",
	background: "var(--skn-surface-raised)",
	color: "var(--skn-text)",
	border: "1px solid var(--skn-border)",
	borderRadius: 6,
	cursor: "pointer",
};
S.btnDestructive = {
	padding: "8px 16px",
	background: "var(--skn-surface)",
	color: "var(--skn-danger-fg)",
	border: "1px solid var(--skn-danger-border)",
	borderRadius: 6,
	cursor: "pointer",
};
// Compact destructive button sized for table rows, where the full-size
// S.btnDestructive would tower over the 6px-padded cells around it.
S.btnDestructiveSm = {
	...S.btnDestructive,
	padding: "4px 10px",
	fontSize: 12,
};
S.dirty = { color: "var(--skn-warn-fg)", fontSize: 12, marginLeft: 8 };
S.cardTitle = {
	fontSize: 14,
	fontWeight: 600,
	flex: 1,
	minWidth: 180,
	margin: 0,
	color: "var(--skn-text)",
};
S.cardPurpose = {
	fontSize: 12,
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	margin: "2px 0 6px",
};
// Shared shape for the small inline card badges (compatibility, legacy).
// Each badge spreads this and adds its own colors and modifiers.
const badgeBase: CSSProperties = {
	display: "inline-block",
	fontSize: 11,
	padding: "1px 6px",
	borderRadius: 4,
};
S.cardCompatibility = {
	...badgeBase,
	marginLeft: 8,
	fontWeight: 500,
};
S.cardLegacy = {
	...badgeBase,
	marginLeft: 8,
	fontWeight: 500,
	background: "var(--skn-legacy-bg)",
	color: "var(--skn-legacy-fg)",
	border: "1px solid var(--skn-legacy-border)",
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
	fontSize: 12,
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
	borderRadius: 4,
	color: "var(--skn-warn-fg)",
	fontSize: 12,
	lineHeight: 1.45,
	margin: "8px 0 6px",
	padding: "6px 8px",
};
S.errorMark = { color: "var(--skn-danger-fg)", fontSize: 14, fontWeight: 700 };
S.loadingText = { color: "var(--skn-text-muted)", fontSize: 13 };
S.savedPill = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	fontSize: 12,
	lineHeight: 1,
	color: "var(--skn-success-fg)",
	background: "var(--skn-success-bg)",
	border: "1px solid var(--skn-success-border)",
	borderRadius: 999,
	padding: "5px 12px",
	marginLeft: 8,
};
S.errorBanner = {
	color: "var(--skn-danger-fg)",
	background: "var(--skn-danger-bg)",
	border: "1px solid var(--skn-danger-border)",
	borderRadius: 6,
	padding: "8px 12px",
	fontSize: 13,
	margin: "8px 0",
	display: "flex",
	alignItems: "center",
	flexWrap: "wrap",
	gap: 12,
};
S.btnRetry = {
	padding: "4px 10px",
	background: "var(--skn-surface)",
	color: "var(--skn-danger-fg)",
	border: "1px solid var(--skn-danger-border)",
	borderRadius: 6,
	fontSize: 12,
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
	gap: 8,
	flexWrap: "wrap",
	marginBottom: 16,
};
S.chip = {
	padding: "6px 12px",
	background: "var(--skn-info-bg)",
	color: "var(--skn-info-fg)",
	border: "1px solid var(--skn-info-border)",
	borderRadius: 999,
	fontSize: 12,
	fontWeight: 500,
	cursor: "pointer",
};

// Config Advisor section. The section reuses S.card; these cover the
// collapsible header, the auto-applied / pending result blocks, and the
// per-item approve/reject controls, all on the existing panel palette.
S.advisorToggle = {
	display: "flex",
	alignItems: "center",
	gap: 8,
	width: "100%",
	background: "none",
	border: "none",
	padding: 0,
	fontSize: 14,
	fontWeight: 600,
	color: "var(--skn-text)",
	cursor: "pointer",
	textAlign: "left",
};
S.advisorBody = { marginTop: 10 };
S.advisorIntro = {
	fontSize: 12,
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	margin: "0 0 10px",
};
S.advisorAutoBlock = {
	background: "var(--skn-success-bg)",
	border: "1px solid var(--skn-success-border)",
	borderRadius: 8,
	padding: "10px 12px",
	marginBottom: 8,
};
S.advisorPendingBlock = {
	background: "var(--skn-warn-bg)",
	border: "1px solid var(--skn-warn-border)",
	borderRadius: 8,
	padding: "10px 12px",
	marginBottom: 8,
};
S.advisorBlockTitle = {
	fontWeight: 600,
	fontSize: 13,
	color: "var(--skn-text)",
};
S.advisorList = { margin: "6px 0 0", paddingLeft: 18, fontSize: 13 };
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
S.advisorRowKey = { fontWeight: 600, fontSize: 13, flex: 1, minWidth: 140 };
S.advisorReason = {
	fontSize: 12,
	color: "var(--skn-text-muted)",
	lineHeight: 1.45,
	marginTop: 4,
};
S.advisorNote = { fontSize: 12, color: "var(--skn-text-faint)", marginTop: 6 };
S.btnApprove = {
	padding: "3px 10px",
	borderRadius: 6,
	fontSize: 12,
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
	padding: "3px 10px",
	borderRadius: 6,
	fontSize: 12,
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
	fontSize: 13,
	fontWeight: 600,
	color: "var(--skn-text)",
	margin: "12px 0 4px",
};
S.tableWrap = { overflowX: "auto" };
S.table = {
	width: "100%",
	borderCollapse: "collapse",
	fontSize: 13,
	color: "var(--skn-text)",
};
S.tableHeadRow = { textAlign: "left", color: "var(--skn-text-muted)" };
S.tableTitle = {
	fontSize: 13,
	fontWeight: 600,
	marginBottom: 4,
	color: "var(--skn-text)",
};
S.tableCell = { padding: 6 };
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
	borderRadius: 8,
	cursor: "pointer",
	fontSize: 13,
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
	fontSize: 12,
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
