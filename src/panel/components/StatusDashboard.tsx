import type * as React from "react";
import type { CSSProperties } from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { humanizeAgo } from "../recency";
import { S } from "../styles";

// Snapshots older than this read as stale: the poll has likely stalled (server
// restart, lost connection), so a dim "updated Xs ago" marker is shown.
const STALE_AFTER_MS = 10000;

// Error badge rendered as a real button (jump to first error). Inherits the
// badge palette and adds button resets plus a pointer cursor.
const ERROR_BADGE_BUTTON: CSSProperties = {
	...S.errorBadge,
	cursor: "pointer",
	font: "inherit",
};
// Dim, right-aligned staleness marker.
const STALE_MARKER: CSSProperties = {
	marginLeft: "auto",
	color: "var(--skn-text-faint)",
	fontSize: 12,
};

export default function StatusDashboard({
	status,
	onErrorBadgeClick,
	lastUpdatedMs,
}: {
	status: StatusSnapshot | null;
	// When provided, the error badge becomes a button that jumps to the first
	// conversion reporting an error. Optional: omitted renders a static badge.
	onErrorBadgeClick?: () => void;
	// Wall-clock timestamp (ms) of the last successful status poll. When the
	// snapshot is older than STALE_AFTER_MS a dim "updated Xs ago" marker is
	// shown. Optional.
	lastUpdatedMs?: number;
}): React.ReactElement {
	if (!status) {
		return (
			<div style={S.statusBar} role="status">
				<span style={{ ...S.dot, ...S.dotOff }} aria-hidden="true" />
				<span>Loading status...</span>
			</div>
		);
	}
	const ready = status.nmea2000Ready;
	const dot = ready ? S.dotOk : S.dotWait;
	const errors = status.perConversion.filter((c) => c.lastErrorMessage).length;
	const errorLabel = `${errors} error${errors > 1 ? "s" : ""}`;
	const staleAgeMs =
		lastUpdatedMs !== undefined ? Date.now() - lastUpdatedMs : undefined;
	const stale = staleAgeMs !== undefined && staleAgeMs > STALE_AFTER_MS;
	return (
		<div style={S.statusBar} role="status">
			<span
				style={{ ...S.dot, ...dot }}
				aria-hidden="true"
				title={ready ? "NMEA 2000 ready" : "Waiting for NMEA 2000 output"}
			/>
			<span>
				<span style={S.statLabel}>Enabled </span>
				<span style={S.statValue}>
					{status.enabledCount} / {status.totalConversions}
				</span>
			</span>
			<span>
				<span style={S.statLabel}>NMEA 2000 </span>
				<span style={S.statValue}>{ready ? "ready" : "waiting"}</span>
			</span>
			{errors > 0 ? (
				onErrorBadgeClick ? (
					<button
						type="button"
						style={ERROR_BADGE_BUTTON}
						onClick={onErrorBadgeClick}
						aria-label={`${errorLabel}. Jump to first error.`}
					>
						{errorLabel}
					</button>
				) : (
					<span style={S.errorBadge}>{errorLabel}</span>
				)
			) : null}
			{stale ? (
				<span style={STALE_MARKER}>updated {humanizeAgo(staleAgeMs)}</span>
			) : null}
		</div>
	);
}
