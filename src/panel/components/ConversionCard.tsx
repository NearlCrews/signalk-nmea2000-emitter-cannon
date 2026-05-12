import type * as React from "react";
import type {
	ConversionMetadata,
	PerConversionStatus,
} from "../../api/types.js";
import type { ConversionConfig } from "../../config/schema.js";
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

export default function ConversionCard(props: Props): React.ReactElement {
	const cfg = props.config ?? EMPTY_CFG;

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
				<span style={S.cardTitle}>{props.meta.title}</span>
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
							value={cfg.sources[p] ?? ""}
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
