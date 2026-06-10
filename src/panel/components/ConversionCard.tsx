import type * as React from "react";
import { Fragment, memo, useCallback } from "react";
import { pgnSummaryFor } from "../../api/pgnSummaries.js";
import type {
	ConversionMetadata,
	PerConversionStatus,
} from "../../api/types.js";
import {
	type ConversionConfig,
	emptyConversionConfig,
} from "../../config/schema.js";
import { pathToPropName } from "../../utils/pathUtils.js";
import { splitPgnTitle } from "../../utils/pgnUtils.js";
import type { Action } from "../hooks/useConfig";
import { humanizeAgo } from "../recency";
import { S } from "../styles";
import DisclosureCaret from "./DisclosureCaret";
import ExtrasEditor from "./ExtrasEditor";
import NumberInput from "./NumberInput";
import SourceField from "./SourceField";

interface Props {
	meta: ConversionMetadata;
	config: ConversionConfig | undefined;
	status: PerConversionStatus | undefined;
	expanded: boolean;
	// dispatch and toggleCard are referentially stable (useReducer dispatch and
	// a useCallback in the parent), and meta/config/status/expanded are stable
	// per card unless that card's own data changes. That lets the memo() wrapper
	// below skip re-rendering every other card on a single-field edit.
	dispatch: React.Dispatch<Action>;
	toggleCard: (key: string) => void;
	sourcesFor: (p: string) => string[];
	ensureLoaded: (p: string) => Promise<void>;
	// Effective global resend interval in seconds, surfaced as the resend
	// field's placeholder so the user sees the value a 0 (inherit) actually
	// resolves to.
	globalResendSeconds: number;
}

const EMPTY_CFG: ConversionConfig = emptyConversionConfig();

// Compatibility badge colors reference theme tokens so the badge stays
// readable in both light and dark host themes.
const COMPATIBILITY_STYLES: Record<
	"consumes" | "ignores" | "partial",
	{ background: string; color: string; border: string; label: string }
> = {
	consumes: {
		background: "var(--skn-success-bg)",
		color: "var(--skn-success-fg)",
		border: "1px solid var(--skn-success-border)",
		label: "Garmin: displays",
	},
	partial: {
		background: "var(--skn-warn-bg)",
		color: "var(--skn-warn-fg)",
		border: "1px solid var(--skn-warn-border)",
		label: "Garmin: partial",
	},
	ignores: {
		background: "var(--skn-surface-raised)",
		color: "var(--skn-text-muted)",
		border: "1px solid var(--skn-border)",
		label: "Garmin: ignores",
	},
};

// Render the title with each PGN number wrapped as an individual hover
// target. Falls back to the raw title when it has no "(PGN[s] ...)" run.
function renderCardTitle(title: string): React.ReactNode {
	const parts = splitPgnTitle(title);
	if (!parts) return title;
	return (
		<>
			{parts.prefix}
			{parts.pgns.map((p, i) => (
				<Fragment key={p}>
					{i > 0 ? ", " : null}
					<span style={S.pgnHover} title={pgnSummaryFor(p)}>
						{p}
					</span>
				</Fragment>
			))}
			{parts.suffix}
		</>
	);
}

function ConversionCard(props: Props): React.ReactElement {
	const { dispatch, toggleCard } = props;
	const key = props.meta.key;
	const cfg = props.config ?? EMPTY_CFG;

	const onSetEnabled = useCallback(
		(enabled: boolean) => dispatch({ type: "setEnabled", key, enabled }),
		[dispatch, key],
	);
	const onSetResend = useCallback(
		(ms: number) => dispatch({ type: "setResend", key, ms }),
		[dispatch, key],
	);
	const onSetSource = useCallback(
		(path: string, source: string) =>
			dispatch({ type: "setSource", key, path, source }),
		[dispatch, key],
	);
	const onSetExtras = useCallback(
		(extras: Record<string, unknown>) =>
			dispatch({ type: "setExtras", key, extras }),
		[dispatch, key],
	);
	const onToggleExpanded = useCallback(
		() => toggleCard(key),
		[toggleCard, key],
	);

	const compatibility = props.meta.compatibility;
	const compatStyle = compatibility
		? COMPATIBILITY_STYLES[compatibility.garmin]
		: null;

	const bodyId = `skn-card-${props.meta.key}`;

	// Emit recency for the card header. "N emits, last Xs ago" once the
	// conversion has emitted; a neutral, dimmed "no recent output" when it is
	// enabled but has produced nothing yet. The wording stays neutral on
	// purpose: legitimately quiet conversions (event-driven AIS, resend
	// disabled) should not read as a fault.
	const st = props.status;
	let recencyLabel: string | null = null;
	if (st && st.emitCount > 0) {
		recencyLabel = `${st.emitCount} emits, last ${humanizeAgo(st.lastEmitMs)}`;
	} else if (st?.enabled) {
		recencyLabel = "no recent output";
	}

	// Resend placeholder shows what a 0 (inherit) resolves to: the global
	// interval in seconds, or that global resend is disabled.
	const resendPlaceholder =
		props.globalResendSeconds === 0
			? "global resend disabled"
			: `global: ${props.globalResendSeconds} s`;

	const errorAgeSuffix =
		st?.lastErrorAgeMs !== undefined
			? ` (${humanizeAgo(st.lastErrorAgeMs)})`
			: "";

	return (
		<div style={S.card}>
			<div style={S.cardHeader}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.enabled}
					onChange={(e) => onSetEnabled(e.target.checked)}
					aria-label={`Enable ${props.meta.title}`}
				/>
				<button
					type="button"
					style={S.cardDisclosure}
					aria-expanded={props.expanded}
					aria-controls={bodyId}
					onClick={onToggleExpanded}
				>
					<DisclosureCaret expanded={props.expanded} />
					<h3 style={S.cardTitle}>{renderCardTitle(props.meta.title)}</h3>
				</button>
				{compatStyle ? (
					<span
						style={{
							...S.cardCompatibility,
							background: compatStyle.background,
							color: compatStyle.color,
							border: compatStyle.border,
						}}
						title={compatibility?.note}
					>
						{compatStyle.label}
					</span>
				) : null}
				{props.meta.legacy ? (
					<span
						style={S.cardLegacy}
						title={`${props.meta.legacy.note} Superseded by ${props.meta.legacy.supersededBy}.`}
					>
						Legacy
					</span>
				) : null}
				{recencyLabel ? <span style={S.cardMeta}>{recencyLabel}</span> : null}
				{props.status?.lastErrorMessage ? (
					<span
						role="img"
						aria-label={`Error: ${props.status.lastErrorMessage}`}
						title={props.status.lastErrorMessage}
						style={S.errorMark}
					>
						⚠
					</span>
				) : null}
			</div>
			{props.meta.description ? (
				<div role="note" style={S.note}>
					<span style={S.notePrefix}>
						<span aria-hidden="true">⚠</span> Note:
					</span>
					{props.meta.description}
				</div>
			) : null}
			{props.expanded ? (
				<div id={bodyId} style={S.cardBody}>
					{/* Inline error banner: the same message the header's ⚠ marks,
					    shown in full for touchscreens where the title tooltip is
					    unreachable. */}
					{props.status?.lastErrorMessage ? (
						<div role="alert" style={S.errorBanner}>
							<span>
								Error: {props.status.lastErrorMessage}
								{errorAgeSuffix}
							</span>
						</div>
					) : null}
					{props.meta.purpose ? (
						<p style={S.cardPurpose}>{props.meta.purpose}</p>
					) : null}
					{/* Compatibility and legacy notes as visible body text so the
					    information in the header badges' tooltips is reachable
					    without a mouse hover. */}
					{compatStyle ? (
						<p style={S.cardPurpose}>
							{compatStyle.label}
							{compatibility?.note ? `. ${compatibility.note}` : ""}
						</p>
					) : null}
					{props.meta.legacy ? (
						<p style={S.cardPurpose}>
							Legacy: {props.meta.legacy.note} Superseded by{" "}
							{props.meta.legacy.supersededBy}.
						</p>
					) : null}
					{/* Options stay visible whether or not the conversion is
					    enabled, so a source or resend can be set up before the
					    enable checkbox is ticked. */}
					<div style={S.fieldRow}>
						<span style={S.label}>
							Resend interval (seconds, 0 = use global setting)
						</span>
						<NumberInput
							value={cfg.resend}
							onChange={onSetResend}
							min={0}
							placeholder={resendPlaceholder}
							ariaLabel={`Resend interval seconds for ${props.meta.title}`}
						/>
					</div>
					{props.meta.paths.map((p) => (
						<SourceField
							key={p}
							path={p}
							// Scope the datalist id by this conversion's option key so
							// two cards sharing a Signal K path do not emit duplicate
							// element ids.
							idScope={key}
							// Read both the panel's native dotted-SK-path key and
							// the dotless propName legacy form: migrateLegacyConfig
							// stores underscored legacy keys verbatim, so for users
							// coming from older configs the dotless propName form
							// (via pathToPropName) is the path of last resort before
							// the field reads empty.
							value={cfg.sources[p] ?? cfg.sources[pathToPropName(p)] ?? ""}
							onChange={(s) => onSetSource(p, s)}
							sourcesFor={props.sourcesFor}
							ensureLoaded={props.ensureLoaded}
						/>
					))}
					<ExtrasEditor
						meta={props.meta.extras}
						value={cfg.extras}
						onChange={onSetExtras}
					/>
				</div>
			) : (
				// Placeholder carrying the body id while collapsed so the
				// header button's aria-controls always resolves to a real node,
				// without mounting the full body for all 75 cards.
				<div id={bodyId} hidden />
			)}
		</div>
	);
}

// Memoized so a single-field edit re-renders only the touched card, not every
// card in the open section (see the Props doc on why the props are stable).
export default memo(ConversionCard);
