import type * as React from "react";
import {
	Button,
	formatRelativeAge,
	RELATIVE_AGE_NARROW,
	SegmentedControl,
	StatusIndicator,
	Text,
	TextInput,
} from "signalk-nearlcrews-ui";
import type { StatusSnapshot } from "../../api/types.js";
import { CONVERSION_STYLES as C } from "../conversionStyles";
import { OUTPUT_STATE_LABELS, OUTPUT_STATE_TONES, outputStateFor } from "../outputState";
import ErrorBadgeButton from "./ErrorBadgeButton";

const STALE_AFTER_MS = 10000;
type PanelView = "configure" | "status";

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
	/**
	 * The search box, which is the panel's first control. The toolbar puts
	 * focus back on it when Clear removes itself, and the panel uses it as the
	 * destination for a banner whose retry takes the banner away.
	 */
	searchRef: React.RefObject<HTMLInputElement | null>;
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
		<section style={C.toolbar} aria-label="Panel controls">
			<div style={C.searchSlot}>
				<TextInput
					ref={props.searchRef}
					type="search"
					value={props.search}
					placeholder="Search conversions by name, PGN, or path"
					aria-label="Search conversions by name, PGN, or path"
					onChange={(e) => props.onSearch(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") props.onClearSearch();
					}}
				/>
			</div>
			{/* Clearing removes this button, so it hands focus back to the search
			    box first. Escape clears from inside the box and leaves focus
			    where it already is. */}
			{props.search ? (
				<Button
					size="compact"
					variant="ghost"
					onClick={() => {
						props.onClearSearch();
						props.searchRef.current?.focus();
					}}
					aria-label="Clear search"
				>
					Clear
				</Button>
			) : null}
			{/* The condensed status chip: enabled over total and the readiness
			    word. It is the one live region in the toolbar, so each poll that
			    changes the count is announced once. The stale marker stays
			    outside it: its age advances on every completed poll including a
			    failed one, so inside the region it would re-announce every three
			    seconds for as long as the outage lasted. */}
			<StatusIndicator live="polite" tone={OUTPUT_STATE_TONES[outputState]}>
				{s ? `${s.enabledCount} / ${s.totalConversions}` : "..."} {OUTPUT_STATE_LABELS[outputState]}
			</StatusIndicator>
			{stale ? (
				<Text tone="muted" size="sm">
					(updated {formatRelativeAge(staleAgeMs, RELATIVE_AGE_NARROW)})
				</Text>
			) : null}
			{errors > 0 ? <ErrorBadgeButton count={errors} onClick={props.onErrorBadgeClick} /> : null}
			<SegmentedControl
				label="View"
				options={props.viewChoices}
				value={props.view}
				onValueChange={props.onChangeView}
			/>
			<Button size="compact" onClick={props.onOpenWizard}>
				Setup wizard
			</Button>
		</section>
	);
}
