import type * as React from "react";
import { Fragment } from "react";
import { pgnSummaryFor } from "../../api/pgnSummaries.js";
import type {
	ConversionMetadata,
	PerConversionStatus,
} from "../../api/types.js";
import type { ConversionConfig } from "../../config/schema.js";
import { pathToPropName } from "../../utils/pathUtils";
import { splitPgnTitle } from "../../utils/pgnUtils.js";
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
	onToggleExpanded: () => void;
	onSetEnabled: (next: boolean) => void;
	onSetResend: (ms: number) => void;
	onSetSource: (path: string, source: string) => void;
	onSetExtras: (extras: Record<string, unknown>) => void;
	sourcesFor: (p: string) => string[];
	ensureLoaded: (p: string) => Promise<void>;
}

const EMPTY_CFG: ConversionConfig = {
	enabled: false,
	resend: 0,
	sources: {},
	extras: {},
};

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

export default function ConversionCard(props: Props): React.ReactElement {
	const cfg = props.config ?? EMPTY_CFG;
	const compatibility = props.meta.compatibility;
	const compatStyle = compatibility
		? COMPATIBILITY_STYLES[compatibility.garmin]
		: null;

	const bodyId = `skn-card-${props.meta.key}`;

	return (
		<div style={S.card}>
			<div style={S.cardHeader}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.enabled}
					onChange={(e) => props.onSetEnabled(e.target.checked)}
					aria-label={`Enable ${props.meta.title}`}
				/>
				<button
					type="button"
					style={S.cardDisclosure}
					aria-expanded={props.expanded}
					aria-controls={bodyId}
					onClick={props.onToggleExpanded}
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
				{props.status?.emitCount ? (
					<span style={S.cardMeta}>{props.status.emitCount} emits</span>
				) : null}
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
					{props.meta.purpose ? (
						<p style={S.cardPurpose}>{props.meta.purpose}</p>
					) : null}
					{/* Options stay visible whether or not the conversion is
					    enabled, so a source or resend can be set up before the
					    enable checkbox is ticked. */}
					<div style={S.fieldRow}>
						<span style={S.label}>Resend (seconds, 0 = global)</span>
						<NumberInput
							value={cfg.resend}
							onChange={props.onSetResend}
							min={0}
							ariaLabel={`Resend interval seconds for ${props.meta.title}`}
						/>
					</div>
					{props.meta.paths.map((p) => (
						<SourceField
							key={p}
							path={p}
							// Read both the panel's native dotted-SK-path key and
							// the dotless propName legacy form: migrateLegacyConfig
							// stores underscored legacy keys verbatim, so for users
							// coming from older configs the dotless propName form
							// (via pathToPropName) is the path of last resort before
							// the field reads empty.
							value={cfg.sources[p] ?? cfg.sources[pathToPropName(p)] ?? ""}
							onChange={(s) => props.onSetSource(p, s)}
							sourcesFor={props.sourcesFor}
							ensureLoaded={props.ensureLoaded}
						/>
					))}
					<ExtrasEditor
						meta={props.meta.extras}
						value={cfg.extras}
						onChange={(e) => props.onSetExtras(e)}
					/>
				</div>
			) : null}
		</div>
	);
}
