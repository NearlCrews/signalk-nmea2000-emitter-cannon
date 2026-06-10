import type * as React from "react";
import { useEffect, useState } from "react";
import type { ApplyDecision } from "../../../advisor/types.js";
import type { Config } from "../../../config/schema.js";
import { useAdvisor } from "../../hooks/useAdvisor.js";
import { S } from "../../styles";
import DisclosureCaret from "../DisclosureCaret.js";
import AdvisorSettings from "./AdvisorSettings.js";
import ReviewResultView from "./ReviewResultView.js";

interface Props {
	advisor: Config["advisor"];
	onChangeAdvisor: (next: NonNullable<Config["advisor"]>) => void;
	/**
	 * Fired whenever the pending-approval list length changes, including back to
	 * 0 once a review is applied or cleared. The integration owner uses this to
	 * render a count pill on the (possibly collapsed) section header so parked
	 * decisions stay visible. Optional: omit it and the panel behaves as before.
	 */
	onPendingCountChange?: (n: number) => void;
	/**
	 * True when the panel has unsaved configuration edits. A review rewrites the
	 * saved config server-side, so while dirty the Review now button is disabled
	 * with an inline note telling the user to save or discard first; otherwise
	 * those unsaved edits would be silently clobbered.
	 */
	dirty?: boolean;
	/**
	 * True when the advisor settings specifically carry unsaved edits. Adds a
	 * hint that those edits will not affect a review until saved, because the
	 * server reads the persisted config, not the in-memory form.
	 */
	advisorSettingsDirty?: boolean;
	/**
	 * Extra non-interactive header content rendered at the trailing edge of the
	 * "Config Advisor" header, visible whether the section is collapsed or open
	 * (e.g. the pending-decision count pill the integration owner derives from
	 * onPendingCountChange). Optional.
	 */
	headerExtra?: React.ReactNode;
}

// Pushes header extras to the trailing edge of the toggle row.
const HEADER_EXTRA: React.CSSProperties = { marginLeft: "auto" };

/**
 * Collapsible "Config Advisor" section: the settings form, a Review now
 * button, the result, and per-item Approve/Reject. Persisting advisor settings
 * uses the panel's single footer Save, so this section has no Save of its own.
 */
export default function AdvisorPanel({
	advisor,
	onChangeAdvisor,
	onPendingCountChange,
	dirty = false,
	advisorSettingsDirty = false,
	headerExtra,
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

	// Surface the parked-count to the integration owner so a collapsed header can
	// show a pill. Fires on every length change, including to 0 after an apply.
	useEffect(() => {
		onPendingCountChange?.(pendingCount);
	}, [pendingCount, onPendingCountChange]);

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
				{headerExtra ? <span style={HEADER_EXTRA}>{headerExtra}</span> : null}
			</button>
			{open && (
				<div style={S.advisorBody}>
					<AdvisorSettings value={advisor} onChange={onChangeAdvisor} />
					<p style={S.advisorIntro}>
						Reviews the Signal K paths your boat publishes and recommends which
						conversions to enable or disable. Recommended enables apply
						automatically unless you turn that off above; disables always wait
						for your approval.
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
				</div>
			)}
		</section>
	);
}
