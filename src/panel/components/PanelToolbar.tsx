import type * as React from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { humanizeAgo } from "../recency";
import { S } from "../styles";
import ErrorBadgeButton from "./ErrorBadgeButton";
import SegmentedControl from "./SegmentedControl";
import ThemeToggle from "./ThemeToggle";

const STALE_AFTER_MS = 10000;
type PanelView = "configure" | "status";

interface Props {
	status: StatusSnapshot | null;
	// Wall-clock timestamp (ms) of the last successful status poll. When the
	// snapshot is older than STALE_AFTER_MS a dim "updated Xs ago" marker is
	// shown. Optional.
	lastUpdatedMs?: number;
	onErrorBadgeClick: () => void;
	search: string;
	onSearch: (v: string) => void;
	onClearSearch: () => void;
	view: PanelView;
	onChangeView: (v: PanelView) => void;
	onOpenWizard: () => void;
	viewChoices: ReadonlyArray<{ value: PanelView; label: string }>;
}

export default function PanelToolbar(props: Props): React.ReactElement {
	const s = props.status;
	const ready = s?.nmea2000Ready === true;
	const errors = s
		? s.perConversion.filter((c) => c.lastErrorMessage).length
		: 0;
	const staleAgeMs =
		props.lastUpdatedMs !== undefined
			? Date.now() - props.lastUpdatedMs
			: undefined;
	const stale = staleAgeMs !== undefined && staleAgeMs > STALE_AFTER_MS;
	return (
		<section
			className="skn-toolbar"
			style={S.toolbar}
			aria-label="Panel controls"
		>
			<input
				type="search"
				style={S.searchInput}
				value={props.search}
				placeholder="Search conversions by name, PGN, or path"
				aria-label="Search conversions by name, PGN, or path"
				onChange={(e) => props.onSearch(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Escape") props.onClearSearch();
				}}
			/>
			{props.search ? (
				<button
					type="button"
					style={S.searchClear}
					onClick={props.onClearSearch}
					aria-label="Clear search"
				>
					Clear
				</button>
			) : null}
			<span style={S.statusChip} role="status">
				<span
					style={{ ...S.dot, ...(ready ? S.dotOk : S.dotWait) }}
					aria-hidden="true"
					title={ready ? "NMEA 2000 ready" : "Waiting for NMEA 2000 output"}
				/>
				{s ? `${s.enabledCount} / ${s.totalConversions}` : "..."}{" "}
				{ready ? "ready" : "waiting"}
				{stale ? (
					<span style={{ marginLeft: 6 }}>
						updated {humanizeAgo(staleAgeMs)} ago
					</span>
				) : null}
			</span>
			{errors > 0 ? (
				<ErrorBadgeButton count={errors} onClick={props.onErrorBadgeClick} />
			) : null}
			<SegmentedControl
				legend="View"
				choices={props.viewChoices}
				value={props.view}
				onChange={props.onChangeView}
			/>
			<ThemeToggle />
			<button type="button" style={S.btnSecondary} onClick={props.onOpenWizard}>
				Setup wizard
			</button>
		</section>
	);
}
