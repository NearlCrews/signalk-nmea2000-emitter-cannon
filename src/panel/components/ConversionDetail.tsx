import type * as React from "react";
import type {
	ConversionMetadata,
	PerConversionStatus,
} from "../../api/types.js";
import type { ConversionConfig } from "../../config/schema.js";
import { pathToPropName } from "../../utils/pathUtils.js";
import { humanizeAgo } from "../recency.js";
import { S } from "../styles";
import ExtrasEditor from "./ExtrasEditor";
import NumberInput from "./NumberInput";
import SourceField from "./SourceField";

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

	// Resend placeholder shows what a 0 (inherit) resolves to: the global
	// interval in seconds, or that global resend is disabled.
	const resendPlaceholder =
		props.globalResendSeconds === 0
			? "global resend disabled"
			: `global: ${props.globalResendSeconds} s`;

	const errorAgeSuffix =
		status?.lastErrorAgeMs !== undefined
			? ` (${humanizeAgo(status.lastErrorAgeMs)})`
			: "";

	const compatibility = meta.compatibility;
	const compatStyle = compatibility
		? COMPATIBILITY_STYLES[compatibility.garmin]
		: null;

	return (
		<div id={props.bodyId} style={S.cardBody}>
			{/* Inline error banner: the same message the header's warning marks,
			    shown in full for touchscreens where the title tooltip is
			    unreachable. */}
			{status?.lastErrorMessage ? (
				<div role="alert" style={S.errorBanner}>
					<span>
						Error: {status.lastErrorMessage}
						{errorAgeSuffix}
					</span>
				</div>
			) : null}
			{meta.purpose ? <p style={S.cardPurpose}>{meta.purpose}</p> : null}
			{/* Usage note in the expanded body only, on the info palette:
			    a permanently visible amber box devalued real cautions. */}
			{meta.description ? (
				<div role="note" style={S.noteInfo}>
					<span style={S.notePrefix}>Note:</span>
					{meta.description}
				</div>
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
			{meta.legacy ? (
				<p style={S.cardPurpose}>
					Legacy: {meta.legacy.note} Superseded by {meta.legacy.supersededBy}.
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
					onChange={props.onSetResend}
					min={0}
					placeholder={resendPlaceholder}
					ariaLabel={`Resend interval seconds for ${meta.title}`}
				/>
			</div>
			{meta.paths.map((p) => (
				<SourceField
					key={p}
					path={p}
					// Scope the datalist id by this conversion's option key so
					// two cards sharing a Signal K path do not emit duplicate
					// element ids.
					idScope={meta.key}
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
				meta={meta.extras}
				value={cfg.extras}
				onChange={props.onSetExtras}
			/>
		</div>
	);
}
