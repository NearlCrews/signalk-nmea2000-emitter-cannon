import type * as React from "react";
import { useEffect, useState } from "react";
import type { ConversionMetadata } from "../../../api/types.js";
import type { Config } from "../../../config/schema.js";
import type { ApplyDecision, Recommendation } from "../../../recommendation/types.js";
import { ADVISOR_STYLES as A } from "../../advisorStyles";
import { useAdvisor } from "../../hooks/useAdvisor.js";
import { plural } from "../../recency";
import { S } from "../../styles";
import Disclosure from "../Disclosure.js";
import AdvisorSettings from "./AdvisorSettings.js";
import ReviewResultView from "./ReviewResultView.js";

interface Props {
	advisor: Config["advisor"];
	onChangeAdvisor: (next: NonNullable<Config["advisor"]>) => void;
	/**
	 * True when the panel has unsaved configuration edits. A review rewrites the
	 * saved config server-side, so while dirty the Review now button is disabled
	 * with an inline note telling the user to save or discard first; otherwise
	 * those unsaved edits would be silently clobbered.
	 */
	dirty?: boolean;
	/**
	 * True when the advisor settings specifically carry unsaved edits. Adds a
	 * hint that those edits will not affect a review until saved, and disables
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
 * collapsed disclosure (reviewing comes first; the settings are a one-time
 * setup). Persisting advisor settings uses the panel's single footer Save, so
 * this section has no Save of its own.
 */
export default function AdvisorPanel({
	advisor,
	onChangeAdvisor,
	dirty = false,
	advisorSettingsDirty = false,
	metaByKey,
}: Props): React.ReactElement {
	const [open, setOpen] = useState(false);
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
	const reviewLabel =
		state.operation === "reviewing"
			? "Reviewing..."
			: state.operation === "applying"
				? "Applying..."
				: "Review now";

	const handleReview = (): void => {
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
		void apply([decision]);
	};

	return (
		<section style={S.card}>
			<Disclosure
				id="skn-advisor-body"
				label="Config Advisor"
				lazy
				open={open}
				onToggle={() => setOpen((o) => !o)}
				// Pending-decision count pill in the trailing summary slot, visible
				// whether the section is collapsed or open so parked decisions stay
				// in sight.
				summary={
					pendingCount > 0 ? (
						<span
							role="img"
							style={A.countPill}
							aria-label={plural(pendingCount, "pending advisor decision")}
						>
							{pendingCount} pending
						</span>
					) : null
				}
			>
				<p style={A.intro}>
					Reviews the Signal K paths your boat publishes and recommends which conversions to enable
					or disable. Recommended enables apply automatically unless you turn that off in Advisor
					settings below; disables always wait for your approval.
				</p>
				<button type="button" style={S.btnPrimary} onClick={handleReview} disabled={busy || dirty}>
					{reviewLabel}
				</button>
				{dirty && (
					<p style={S.note}>
						<span style={S.notePrefix}>Heads up:</span>
						Save or discard your changes first. A review may update the saved configuration.
					</p>
				)}
				{advisorSettingsDirty && (
					<p style={S.helpHint}>
						Unsaved advisor settings above will not affect a review until you Save.
					</p>
				)}
				{state.error && (
					<div role="alert" style={S.errorBanner}>
						<span>{state.error}</span>
					</div>
				)}
				{state.result && (
					<div style={A.stackGap}>
						<ReviewResultView
							result={state.result}
							metaByKey={metaByKey}
							onApprove={approveOne}
							onReject={dismissPending}
							busy={busy}
						/>
					</div>
				)}
				{/* Settings last, behind their own disclosure: the form (toggle,
				    QuestDB, schedule) is one-time setup and should not greet the
				    user ahead of the review action. The wrapper div keeps the
				    spacing between the review area and the settings toggle. */}
				<div style={A.stackGap}>
					<Disclosure id="skn-advisor-settings" label="Advisor settings">
						<AdvisorSettings
							value={advisor}
							onChange={onChangeAdvisor}
							advisorSettingsDirty={advisorSettingsDirty}
						/>
					</Disclosure>
				</div>
			</Disclosure>
		</section>
	);
}
