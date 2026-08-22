import type * as React from "react";
import {
	Button,
	formatRelativeAge,
	SegmentedControl,
	TextInput,
	ThemeToggle,
} from "signalk-nearlcrews-ui";
import type { StatusSnapshot } from "../../api/types.js";
import { type OutputState, outputStateFor } from "../outputState";
import { RELATIVE_AGE_FORMAT } from "../recency";
import { S } from "../styles";
import { TOOLBAR_STYLES as T } from "../toolbarStyles";
import ErrorBadgeButton from "./ErrorBadgeButton";

const STALE_AFTER_MS = 10000;
type PanelView = "configure" | "status";

const OUTPUT_STATE_TITLES: Record<OutputState, string> = {
	loading: "Loading plugin status",
	inactive: "Plugin is not running",
	waiting: "Waiting for NMEA 2000 output",
	ready: "NMEA 2000 ready",
};

interface Props {
	status: StatusSnapshot | null;
	// Wall-clock timestamp (ms) of the last successful status poll. When the
	// snapshot is older than STALE_AFTER_MS a dim "updated Xs ago" marker is
	// shown. Optional.
	lastUpdatedMs: number | undefined;
	// Timestamp of the latest poll completion, used as the render clock for the
	// staleness label when consecutive polls fail.
	lastAttemptMs: number | undefined;
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
	const outputState = outputStateFor(s);
	const errors = s
		? s.perConversion.filter((c) => c.parentKey === undefined && c.lastErrorMessage).length
		: 0;
	const staleAgeMs =
		props.lastUpdatedMs !== undefined
			? (props.lastAttemptMs ?? Date.now()) - props.lastUpdatedMs
			: undefined;
	const stale = staleAgeMs !== undefined && staleAgeMs > STALE_AFTER_MS;
	return (
		<section className="skn-toolbar" style={T.root} aria-label="Panel controls">
			<TextInput
				type="search"
				style={T.searchInput}
				value={props.search}
				placeholder="Search conversions by name, PGN, or path"
				aria-label="Search conversions by name, PGN, or path"
				onChange={(e) => props.onSearch(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Escape") props.onClearSearch();
				}}
			/>
			{props.search ? (
				<Button
					size="compact"
					variant="ghost"
					style={T.searchClear}
					onClick={props.onClearSearch}
					aria-label="Clear search"
				>
					Clear
				</Button>
			) : null}
			<span style={T.statusChip}>
				<span
					style={{
						...S.dot,
						...(outputState === "ready"
							? S.dotOk
							: outputState === "waiting"
								? S.dotWait
								: S.dotOff),
					}}
					aria-hidden="true"
					title={OUTPUT_STATE_TITLES[outputState]}
				/>
				<span role="status">
					{s ? `${s.enabledCount} / ${s.totalConversions}` : "..."} {outputState}
				</span>
				{stale ? (
					<span style={T.statusChipStale}>
						updated {formatRelativeAge(staleAgeMs, RELATIVE_AGE_FORMAT)}
					</span>
				) : null}
			</span>
			{errors > 0 ? <ErrorBadgeButton count={errors} onClick={props.onErrorBadgeClick} /> : null}
			<SegmentedControl
				legend="View"
				options={props.viewChoices}
				value={props.view}
				onChange={props.onChangeView}
			/>
			<ThemeToggle />
			<Button size="compact" style={T.setupButton} onClick={props.onOpenWizard}>
				Setup wizard
			</Button>
		</section>
	);
}
