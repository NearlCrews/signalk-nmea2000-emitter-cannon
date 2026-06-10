import type * as React from "react";
import type { CSSProperties } from "react";
import type {
	ConversionMetadata,
	PerConversionStatus,
	StatusSnapshot,
} from "../../api/types.js";
import { stripSubIndex } from "../../utils/pathUtils.js";
import { extractPgnsFromTitle } from "../../utils/pgnUtils.js";
import { humanizeAgo, plural } from "../recency";
import { S } from "../styles";
import { StatusLoading } from "./StatusDashboard";

interface Props {
	// Live status snapshot, or null before the first poll resolves.
	status: StatusSnapshot | null;
	// Conversion catalog keyed by option key (the parent's memoized map), used
	// to resolve each enabled row's PGN list. Factory sub-conversion rows
	// (`BATTERY[0]`) resolve via their parent key; the title parse is the
	// fallback only when no catalog entry exists at all.
	metaByKey: Map<string, ConversionMetadata>;
}

// Touch-friendly table cell: taller rows than the dense advisor table so a
// finger target clears the row above and below. Row separation via a bottom
// border that reads in both themes.
const CELL: CSSProperties = {
	padding: "12px 10px",
	borderBottom: "1px solid var(--skn-border)",
	verticalAlign: "top",
};
const HEAD_CELL: CSSProperties = {
	padding: "10px",
	fontWeight: 600,
	borderBottom: "2px solid var(--skn-border)",
};
const PGN_CELL: CSSProperties = {
	...CELL,
	fontVariantNumeric: "tabular-nums",
	color: "var(--skn-text-muted)",
};
const NUM_CELL: CSSProperties = {
	...CELL,
	textAlign: "right",
	fontVariantNumeric: "tabular-nums",
};
const QUIET_TEXT: CSSProperties = { color: "var(--skn-text-faint)" };
const ERROR_TEXT: CSSProperties = { color: "var(--skn-danger-fg)" };
const HEADER_ROW: CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: 18,
	alignItems: "center",
	marginBottom: 12,
	fontSize: "var(--skn-font-body)",
};
const EMPTY_TEXT: CSSProperties = {
	...S.loadingText,
	padding: "12px 0",
};

function pgnsFor(
	row: PerConversionStatus,
	byKey: Map<string, ConversionMetadata>,
): string {
	const m = byKey.get(row.key) ?? byKey.get(stripSubIndex(row.key));
	const pgns =
		m && m.pgns.length > 0 ? m.pgns : extractPgnsFromTitle(row.title);
	return pgns.join(", ");
}

export default function StatusView({
	status,
	metaByKey,
}: Props): React.ReactElement {
	if (!status) {
		return <StatusLoading />;
	}

	const enabledRows = status.perConversion.filter((c) => c.enabled);
	const errorCount = enabledRows.filter((c) => c.lastErrorMessage).length;
	const totalEmits = enabledRows.reduce((n, c) => n + c.emitCount, 0);
	const ready = status.nmea2000Ready;
	const readyDot = ready ? S.dotOk : S.dotWait;

	return (
		<div style={S.root}>
			<div style={HEADER_ROW} role="status">
				<span>
					<span
						style={{ ...S.dot, ...readyDot, marginRight: 6 }}
						aria-hidden="true"
					/>
					<span style={S.statLabel}>NMEA 2000 </span>
					<span style={S.statValue}>{ready ? "ready" : "waiting"}</span>
				</span>
				<span>
					<span style={S.statLabel}>Enabled </span>
					<span style={S.statValue}>
						{status.enabledCount} / {status.totalConversions}
					</span>
				</span>
				<span>
					<span style={S.statLabel}>Total emits </span>
					<span style={S.statValue}>{totalEmits}</span>
				</span>
				{errorCount > 0 ? (
					<span style={S.errorBadge}>{plural(errorCount, "error")}</span>
				) : null}
			</div>

			{enabledRows.length === 0 ? (
				<p style={EMPTY_TEXT}>
					No conversions enabled. Enable conversions in the Configure view to
					see live output here.
				</p>
			) : (
				<div style={S.tableWrap}>
					<table style={S.table}>
						<thead>
							<tr style={S.tableHeadRow}>
								<th style={HEAD_CELL}>Conversion</th>
								<th style={HEAD_CELL}>PGNs</th>
								<th style={{ ...HEAD_CELL, textAlign: "right" }}>Emits</th>
								<th style={HEAD_CELL}>Last emit</th>
								<th style={HEAD_CELL}>Status</th>
							</tr>
						</thead>
						<tbody>
							{enabledRows.map((row) => {
								const recency =
									row.emitCount > 0
										? humanizeAgo(row.lastEmitMs)
										: "no recent output";
								return (
									<tr key={row.key}>
										<td style={CELL}>{row.title}</td>
										<td style={PGN_CELL}>{pgnsFor(row, metaByKey) || "-"}</td>
										<td style={NUM_CELL}>{row.emitCount}</td>
										<td style={CELL}>
											{row.emitCount > 0 ? (
												recency
											) : (
												<span style={QUIET_TEXT}>{recency}</span>
											)}
										</td>
										<td style={CELL}>
											{row.lastErrorMessage ? (
												<span style={ERROR_TEXT}>
													<span aria-hidden="true">⚠ </span>
													{row.lastErrorMessage}
													{row.lastErrorAgeMs !== undefined
														? ` (${humanizeAgo(row.lastErrorAgeMs)})`
														: ""}
												</span>
											) : (
												<span style={QUIET_TEXT}>ok</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
