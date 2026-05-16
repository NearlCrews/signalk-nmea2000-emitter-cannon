import type * as React from "react";
import type {
	ConversionMetadata,
	PerConversionStatus,
} from "../../api/types.js";
import type { ConversionConfig } from "../../config/schema.js";
import { pathToPropName } from "../../utils/pathUtils";
import { S } from "../styles";
import ExtrasEditor from "./ExtrasEditor";
import SourceField from "./SourceField";

interface Props {
	meta: ConversionMetadata;
	config: ConversionConfig | undefined;
	status: PerConversionStatus | undefined;
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

const COMPATIBILITY_STYLES: Record<
	"consumes" | "ignores" | "partial",
	{ background: string; color: string; border: string; label: string }
> = {
	consumes: {
		background: "#dcfce7",
		color: "#166534",
		border: "1px solid #86efac",
		label: "Garmin: displays",
	},
	partial: {
		background: "#fef3c7",
		color: "#78350f",
		border: "1px solid #fbbf24",
		label: "Garmin: partial",
	},
	ignores: {
		background: "#f3f4f6",
		color: "#374151",
		border: "1px solid #d1d5db",
		label: "Garmin: ignores",
	},
};

export default function ConversionCard(props: Props): React.ReactElement {
	const cfg = props.config ?? EMPTY_CFG;
	const compatibility = props.meta.compatibility;
	const compatStyle = compatibility
		? COMPATIBILITY_STYLES[compatibility.garmin]
		: null;

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
				<h3 style={S.cardTitle}>{props.meta.title}</h3>
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
				{props.status?.emitCount ? (
					<span style={S.cardMeta}>{props.status.emitCount} emits</span>
				) : null}
				{props.status?.lastErrorMessage ? (
					<span
						title={props.status.lastErrorMessage}
						style={{ color: "#ef4444", fontSize: 12 }}
					>
						!
					</span>
				) : null}
			</div>
			{props.meta.purpose ? (
				<p style={S.cardPurpose}>{props.meta.purpose}</p>
			) : null}
			{props.meta.description ? (
				<div
					role="note"
					style={{
						background: "#fef3c7",
						border: "1px solid #fbbf24",
						borderRadius: 4,
						color: "#78350f",
						fontSize: 12,
						lineHeight: 1.45,
						margin: "4px 0 6px",
						padding: "6px 8px",
					}}
				>
					<span style={S.notePrefix} aria-hidden="true">
						⚠ Note:
					</span>
					{props.meta.description}
				</div>
			) : null}
			{cfg.enabled ? (
				<>
					<div style={S.fieldRow}>
						<span style={S.label}>Resend (seconds, 0 = global)</span>
						<input
							type="number"
							min={0}
							style={S.input}
							value={cfg.resend}
							onChange={(e) =>
								props.onSetResend(Math.max(0, Number(e.target.value) | 0))
							}
							aria-label={`Resend interval seconds for ${props.meta.title}`}
						/>
					</div>
					{props.meta.paths.map((p) => (
						<SourceField
							key={p}
							path={p}
							// Read both the panel's native dotted-SK-path key and the
							// dotless propName legacy form: migrateLegacyConfig stores
							// underscored legacy keys verbatim, so for users coming
							// from older configs the dotless propName form (via
							// pathToPropName) is the path of last resort before the
							// field reads empty.
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
				</>
			) : null}
		</div>
	);
}
