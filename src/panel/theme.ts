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
	--skn-space-half: 4px;
	--skn-space-compact: 6px;
	--skn-space-1: 8px;
	--skn-space-2: 12px;
	--skn-space-3: 16px;
	--skn-control-height: 36px;
	--skn-row-height: 40px;
	--skn-toolbar-height: 52px;
	--skn-field-padding: 6px 10px;
	--skn-control-padding: 6px 12px;
	--skn-transition-fast: 120ms;
	--skn-modal-backdrop: rgba(0, 0, 0, 0.5);
	--skn-modal-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
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
/* Native form controls do not inherit the panel font-family, so they fall
   back to the browser default and read inconsistently with the rest of the
   panel. font-family only (not the font shorthand, which would clobber each
   control's own font-size). */
.skn-panel button,
.skn-panel input,
.skn-panel select,
.skn-panel textarea {
	font-family: inherit;
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
		background-color var(--skn-transition-fast) ease,
		border-color var(--skn-transition-fast) ease;
}
.skn-panel button {
	transition:
		background-color var(--skn-transition-fast) ease,
		border-color var(--skn-transition-fast) ease,
		filter var(--skn-transition-fast) ease;
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
.skn-toolbar { position: sticky; top: 0; z-index: 2; }
.skn-row { scroll-margin-top: var(--skn-toolbar-height); }
.skn-row:hover { filter: brightness(0.97); }
`;
