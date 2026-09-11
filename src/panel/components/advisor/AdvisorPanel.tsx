import type * as React from "react";
import { useEffect, useId, useState } from "react";
import {
	Badge,
	Banner,
	Button,
	Cluster,
	CollapsibleSection,
	LiveRegion,
	Stack,
	Text,
} from "signalk-nearlcrews-ui";
import type { ConversionMetadata } from "../../../api/types.js";
import type { Config } from "../../../config/schema.js";
import type { ApplyDecision, Recommendation } from "../../../recommendation/types.js";
import { useAdvisor } from "../../hooks/useAdvisor.js";
import AdvisorSettings from "./AdvisorSettings.js";
import ReviewResultView from "./ReviewResultView.js";

interface Props {
	advisor: Config["advisor"];
	onChangeAdvisor: (next: NonNullable<Config["advisor"]>) => void;
	/**
	 * True when the panel has unsaved configuration edits. A review rewrites the
	 * saved config server-side, so while dirty the Review now button blocks
	 * activation and points at an inline note telling the user to save or
	 * discard first; otherwise those unsaved edits would be silently clobbered.
	 */
	dirty?: boolean;
	/**
	 * True when the advisor settings specifically carry unsaved edits. Adds a
	 * hint that those edits will not affect a review until saved, and blocks
	 * the connection-test buttons, because the server reads the persisted
	 * config, not the in-memory form.
	 */
	advisorSettingsDirty?: boolean;
	/**
	 * Conversion catalog keyed by option key (the parent's memoized map), so
	 * review results can show conversion titles instead of raw option keys.
	 */
	metaByKey: Map<string, ConversionMetadata>;
}

/**
 * Collapsible "Config Advisor" section: an intro, the Review now button, the
 * result with per-item Approve/Reject, and the settings form behind its own
 * collapsed section (reviewing comes first; the settings are a one-time
 * setup). Persisting advisor settings uses the panel's single footer Save, so
 * this section has no Save of its own. The review and pending state live in
 * this component, outside the collapsible body, so they survive a collapse.
 */
export default function AdvisorPanel({
	advisor,
	onChangeAdvisor,
	dirty = false,
	advisorSettingsDirty = false,
	metaByKey,
}: Props): React.ReactElement {
	const [open, setOpen] = useState(false);
	// The recommendation whose Approve was pressed, so ReviewResultView can show
	// the progress on that control rather than on all of them.
	const [applyingKey, setApplyingKey] = useState<string | null>(null);
	const dirtyHintId = useId();
	const { state, review, apply, loadPending, dismissPending } = useAdvisor();

	// Load any parked decisions from a prior (e.g. scheduled) review on mount so
	// they are visible without clicking Review now. loadPending is stable, so
	// this runs once.
	useEffect(() => {
		void loadPending();
	}, [loadPending]);

	const pending = state.result?.pending ?? [];
	const pendingCount = pending.length;
	const busy = state.operation !== "idle";
	// The shared Button keeps its accessible name stable while busy and exposes
	// the progress wording as a description, so the control is not announced as
	// a different element part way through the operation.
	const busyLabel = state.operation === "applying" ? "Applying" : "Reviewing";

	const handleReview = (): void => {
		setApplyingKey(null);
		void review();
	};

	// Approve applies the one recommendation immediately (an enable, a disable,
	// or a clear-source), so there is no separate Apply step. Reject dismisses
	// it from the list without changing the config.
	const approveOne = (r: Recommendation): void => {
		const decision: ApplyDecision =
			r.action === "clear-source"
				? {
						optionKey: r.optionKey,
						approved: true,
						action: "clear-source",
						clearSources: (r.staleSources ?? []).map(({ path, pinned }) => ({ path, pinned })),
					}
				: {
						optionKey: r.optionKey,
						approved: true,
						action: r.action === "enable" ? "enable" : "disable",
					};
		setApplyingKey(r.optionKey);
		void apply([decision]);
	};

	return (
		<CollapsibleSection
			title="Config Advisor"
			mountStrategy="unmount"
			open={open}
			onOpenChange={setOpen}
			// Pending-decision count in the header summary, visible whether the
			// section is collapsed or open so parked decisions stay in sight.
			summaryPlacement="header"
			summaryVisibility="always"
			summary={pendingCount > 0 ? <Badge tone="warning">{pendingCount} pending</Badge> : undefined}
		>
			<Stack gap={3}>
				<Text as="p" tone="muted" size="sm">
					Reviews the Signal K paths your boat publishes and recommends which conversions to enable
					or disable. Recommended enables apply automatically unless you turn that off in Advisor
					settings below; disables always wait for your approval.
				</Text>
				<Cluster>
					{/* Blocked, not removed from the tab order: a natively disabled
					    button is skipped by keyboard, so the reason below it would
					    never be reached from the control it explains. */}
					<Button
						variant="primary"
						onClick={handleReview}
						loading={busy}
						loadingLabel={busyLabel}
						ariaDisabled={dirty}
						aria-describedby={dirty ? dirtyHintId : undefined}
					>
						Review now
					</Button>
				</Cluster>
				{dirty && (
					<Banner id={dirtyHintId} tone="warning" title="Save or discard your changes first">
						A review may update the saved configuration, so Review now waits until the panel is
						clean.
					</Banner>
				)}
				{advisorSettingsDirty && (
					<Text as="p" tone="muted" size="sm">
						Unsaved advisor settings below will not affect a review until you Save.
					</Text>
				)}
				{/* Mounted before any message so a screen reader observes the text
				    change rather than the region appearing with it. */}
				<LiveRegion
					live="assertive"
					message={state.error ? `Advisor request failed: ${state.error}` : ""}
				/>
				{state.error && (
					<Banner title="Advisor request failed" tone="danger">
						{state.error}
					</Banner>
				)}
				{state.result && (
					<ReviewResultView
						result={state.result}
						metaByKey={metaByKey}
						onApprove={approveOne}
						onReject={dismissPending}
						busy={busy}
						applyingKey={applyingKey}
					/>
				)}
				{/* Settings last, behind their own collapsible: the form (toggle,
				    QuestDB, schedule) is one-time setup and should not greet the
				    user ahead of the review action. */}
				<CollapsibleSection title="Advisor settings" headingLevel={3}>
					<AdvisorSettings
						value={advisor}
						onChange={onChangeAdvisor}
						advisorSettingsDirty={advisorSettingsDirty}
					/>
				</CollapsibleSection>
			</Stack>
		</CollapsibleSection>
	);
}
