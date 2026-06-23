import type * as React from "react";
import { useEffect, useState } from "react";
import type { ApplyDecision } from "../../../advisor/types.js";
import type { ConversionMetadata } from "../../../api/types.js";
import type { Config } from "../../../config/schema.js";
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
	const { state, review, apply, loadPending } = useAdvisor();
	const [decisions, setDecisions] = useState<Record<string, boolean>>({});

	// Load any parked decisions from a prior (e.g. scheduled) review on mount so
	// they are visible without clicking Review now. loadPending is stable, so
	// this runs once.
	useEffect(() => {
		void loadPending();
	}, [loadPending]);

	const pending = state.result?.pending ?? [];
	const pendingCount = pending.length;

	let approvedCount = 0;
	let rejectedCount = 0;
	for (const r of pending) {
		const choice = decisions[r.optionKey];
		if (choice === true) approvedCount++;
		else if (choice === false) rejectedCount++;
	}
	const decidedCount = approvedCount + rejectedCount;
	const undecidedCount = pendingCount - decidedCount;

	const handleReview = (): void => {
		// Drop any prior Approve/Reject choices: the new review's pending list
		// can reuse an optionKey, and a stale decision would otherwise be sent
		// by applyDecided.
		setDecisions({});
		void review();
	};

	const decide = (optionKey: string, approved: boolean): void => {
		setDecisions((d) => ({ ...d, [optionKey]: approved }));
	};

	const applyDecided = (): void => {
		// Send ONLY decided items. An undecided pending item must NOT be sent as
		// approved: false, which would silently reject a recommendation the user
		// never looked at. applyReview acts on each decision's action, so carry
		// it; a clear-source decision also carries the stale path pins to remove.
		const list: ApplyDecision[] = pending
			.filter((r) => r.optionKey in decisions)
			.map((r) => {
				const approved = decisions[r.optionKey] ?? false;
				if (r.action === "clear-source") {
					return {
						optionKey: r.optionKey,
						approved,
						action: "clear-source",
						clearSourcePaths: (r.staleSources ?? []).map((s) => s.path),
					};
				}
				return {
					optionKey: r.optionKey,
					approved,
					action: r.action === "enable" ? "enable" : "disable",
				};
			});
		if (list.length === 0) return;
		void apply(list);
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
							style={S.countPill}
							aria-label={plural(pendingCount, "pending advisor decision")}
						>
							{pendingCount} pending
						</span>
					) : null
				}
			>
				<p style={S.advisorIntro}>
					Reviews the Signal K paths your boat publishes and recommends which
					conversions to enable or disable. Recommended enables apply
					automatically unless you turn that off in Advisor settings below;
					disables always wait for your approval.
				</p>
				<button
					type="button"
					style={S.btnPrimary}
					onClick={handleReview}
					disabled={state.loading || dirty}
				>
					{state.loading ? "Reviewing..." : "Review now"}
				</button>
				{dirty && (
					<p style={S.note}>
						<span style={S.notePrefix}>Heads up:</span>
						Save or discard your changes first. A review rewrites the saved
						configuration.
					</p>
				)}
				{advisorSettingsDirty && (
					<p style={S.helpHint}>
						Unsaved advisor settings above will not affect a review until you
						Save.
					</p>
				)}
				{state.error && (
					<div role="alert" style={S.errorBanner}>
						<span>{state.error}</span>
					</div>
				)}
				{state.result && (
					<div style={S.advisorStackGap}>
						<ReviewResultView
							result={state.result}
							decisions={decisions}
							metaByKey={metaByKey}
							onApprove={(k) => decide(k, true)}
							onReject={(k) => decide(k, false)}
						/>
						{pendingCount > 0 && (
							<button
								type="button"
								style={S.btnSecondary}
								onClick={applyDecided}
								disabled={state.loading || decidedCount === 0}
							>
								{`Apply decisions: ${approvedCount} approved, ${rejectedCount} rejected, ${undecidedCount} undecided`}
							</button>
						)}
					</div>
				)}
				{/* Settings last, behind their own disclosure: the form (toggle,
				    QuestDB, schedule) is one-time setup and should not greet the
				    user ahead of the review action. The wrapper div keeps the
				    spacing between the review area and the settings toggle. */}
				<div style={S.advisorStackGap}>
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
