import type * as React from "react";
import type { CSSProperties } from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { humanizeAgo } from "../recency";
import { S } from "../styles";
import ErrorBadgeButton from "./ErrorBadgeButton";

// Snapshots older than this read as stale: the poll has likely stalled (server
// restart, lost connection), so a dim "updated Xs ago" marker is shown.
const STALE_AFTER_MS = 10000;

// Dim, right-aligned staleness marker: the shared small-faint text pushed to
// the trailing edge of the status bar.
const STALE_MARKER: CSSProperties = { ...S.textSmallFaint, marginLeft: "auto" };

// Placeholder shown before the first status poll resolves. Shared by
// StatusDashboard and StatusView so the two views stay byte-identical.
export function StatusLoading(): React.ReactElement {
	return (
		<div style={S.statusBar} role="status">
			<span style={{ ...S.dot, ...S.dotOff }} aria-hidden="true" />
			<span>Loading status...</span>
		</div>
	);
}

export default function StatusDashboard({
	status,
	onErrorBadgeClick,
	lastUpdatedMs,
}: {
	status: StatusSnapshot | null;
	// Jump to the first conversion reporting an error; the error badge is a
	// button wired to this.
	onErrorBadgeClick: () => void;
	// Wall-clock timestamp (ms) of the last successful status poll. When the
	// snapshot is older than STALE_AFTER_MS a dim "updated Xs ago" marker is
	// shown. Optional.
	lastUpdatedMs?: number;
}): React.ReactElement {
	if (!status) {
		return <StatusLoading />;
	}
	const ready = status.nmea2000Ready;
	const dot = ready ? S.dotOk : S.dotWait;
	const errors = status.perConversion.filter((c) => c.lastErrorMessage).length;
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
				<ErrorBadgeButton count={errors} onClick={onErrorBadgeClick} />
			) : null}
			{stale ? (
				<span style={STALE_MARKER}>updated {humanizeAgo(staleAgeMs)}</span>
			) : null}
		</div>
	);
}
