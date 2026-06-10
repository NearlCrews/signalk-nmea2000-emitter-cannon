import type * as React from "react";
import { useEffect, useState } from "react";
import type { ApplyDecision } from "../../../advisor/types.js";
import type { ConversionMetadata } from "../../../api/types.js";
import type { Config } from "../../../config/schema.js";
import { useAdvisor } from "../../hooks/useAdvisor.js";
import { plural } from "../../recency";
import { S } from "../../styles";
import DisclosureCaret from "../DisclosureCaret.js";
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

// Pending-decision count pill at the trailing edge of the toggle row, visible
// whether the section is collapsed or open so parked decisions stay in sight.
const PENDING_PILL: React.CSSProperties = {
	...S.countPill,
	marginLeft: "auto",
};

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
	const [settingsOpen, setSettingsOpen] = useState(false);
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
		// never looked at. applyReview sets enabled from each decision's action,
		// so carry it; pending is only enable/disable.
		const list: ApplyDecision[] = pending
			.filter((r) => r.optionKey in decisions)
			.map((r) => ({
				optionKey: r.optionKey,
				approved: decisions[r.optionKey] ?? false,
				action: r.action === "enable" ? "enable" : "disable",
			}));
		if (list.length === 0) return;
		void apply(list);
	};

	return (
		<section style={S.card}>
			<button
				type="button"
				style={S.advisorToggle}
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<DisclosureCaret expanded={open} />
				Config Advisor
				{pendingCount > 0 ? (
					<span
						role="img"
						style={PENDING_PILL}
						aria-label={plural(pendingCount, "pending advisor decision")}
					>
						{pendingCount} pending
					</span>
				) : null}
			</button>
			{open && (
				<div style={S.advisorBody}>
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
						<div style={S.advisorBody}>
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
					    API key, QuestDB) is one-time setup and should not greet the
					    user ahead of the review action. */}
					<div style={S.advisorBody}>
						<button
							type="button"
							style={S.advisorToggle}
							aria-expanded={settingsOpen}
							aria-controls="skn-advisor-settings"
							onClick={() => setSettingsOpen((o) => !o)}
						>
							<DisclosureCaret expanded={settingsOpen} />
							Advisor settings
						</button>
						{settingsOpen ? (
							<div id="skn-advisor-settings" style={S.advisorBody}>
								<AdvisorSettings
									value={advisor}
									onChange={onChangeAdvisor}
									advisorSettingsDirty={advisorSettingsDirty}
								/>
							</div>
						) : (
							// Placeholder keeps the aria-controls target present
							// while collapsed.
							<div id="skn-advisor-settings" hidden />
						)}
					</div>
				</div>
			)}
		</section>
	);
}
