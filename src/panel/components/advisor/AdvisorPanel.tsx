import type * as React from "react";
import { useState } from "react";
import type { ApplyDecision } from "../../../advisor/types.js";
import type { Config } from "../../../config/schema.js";
import { useAdvisor } from "../../hooks/useAdvisor.js";
import { S } from "../../styles";
import DisclosureCaret from "../DisclosureCaret.js";
import SaveStatus from "../SaveStatus.js";
import AdvisorSettings from "./AdvisorSettings.js";
import ReviewResultView from "./ReviewResultView.js";

interface Props {
	advisor: Config["advisor"];
	onChangeAdvisor: (next: NonNullable<Config["advisor"]>) => void;
	dirty: boolean;
	onSave: () => void;
	/** Epoch ms of the last successful save, or null. Drives the Saved pill. */
	justSavedAt: number | null;
}

/**
 * Collapsible "Config Advisor" section: the settings form, a Review now
 * button, the result, and per-item Approve/Reject.
 */
export default function AdvisorPanel({
	advisor,
	onChangeAdvisor,
	dirty,
	onSave,
	justSavedAt,
}: Props): React.ReactElement {
	const [open, setOpen] = useState(false);
	const { state, review, apply } = useAdvisor();
	const [decisions, setDecisions] = useState<Record<string, boolean>>({});

	const handleReview = (): void => {
		// Drop any prior Approve/Reject choices: the new review's pending list
		// can reuse an optionKey, and a stale decision would otherwise be sent
		// by applyAll.
		setDecisions({});
		void review();
	};

	const decide = (optionKey: string, approved: boolean): void => {
		setDecisions((d) => ({ ...d, [optionKey]: approved }));
	};

	const applyAll = (): void => {
		// Iterate the pending list, not `decisions`: an untouched pending item
		// must still be sent (as approved: false). applyReview sets enabled from
		// each decision's action, so carry it; pending is only enable/disable.
		const list: ApplyDecision[] = (state.result?.pending ?? []).map((r) => ({
			optionKey: r.optionKey,
			approved: decisions[r.optionKey] ?? false,
			action: r.action === "enable" ? "enable" : "disable",
		}));
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
						disabled={state.loading}
					>
						{state.loading ? "Reviewing..." : "Review now"}
					</button>
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
							{state.result.pending.length > 0 && (
								<button type="button" style={S.btnSecondary} onClick={applyAll}>
									Apply approved
								</button>
							)}
						</div>
					)}
					<div style={S.advisorSaveRow}>
						<button
							type="button"
							style={S.btnPrimary}
							onClick={onSave}
							disabled={!dirty}
						>
							Save
						</button>
						<SaveStatus dirty={dirty} justSavedAt={justSavedAt} />
					</div>
				</div>
			)}
		</section>
	);
}
