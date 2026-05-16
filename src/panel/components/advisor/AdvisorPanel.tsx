import type * as React from "react";
import { useState } from "react";
import type { ApplyDecision } from "../../../advisor/types.js";
import type { Config } from "../../../config/schema.js";
import { useAdvisor } from "../../hooks/useAdvisor.js";
import { S } from "../../styles";
import AdvisorSettings from "./AdvisorSettings.js";
import ReviewResultView from "./ReviewResultView.js";

interface Props {
	advisor: Config["advisor"];
	onChangeAdvisor: (next: NonNullable<Config["advisor"]>) => void;
}

/**
 * Collapsible "Config Advisor" section: the settings form, a Review now
 * button, the result, and per-item Approve/Reject.
 */
export default function AdvisorPanel({
	advisor,
	onChangeAdvisor,
}: Props): React.ReactElement {
	const [open, setOpen] = useState(false);
	const { state, review, apply } = useAdvisor();
	const [decisions, setDecisions] = useState<Record<string, boolean>>({});

	const decide = (optionKey: string, approved: boolean): void => {
		setDecisions((d) => ({ ...d, [optionKey]: approved }));
	};

	const applyAll = (): void => {
		const list: ApplyDecision[] = Object.entries(decisions).map(
			([optionKey, approved]) => ({ optionKey, approved }),
		);
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
				<span style={S.advisorCaret}>{open ? "▾" : "▸"}</span>
				Config Advisor
			</button>
			{open && (
				<div style={S.advisorBody}>
					<AdvisorSettings value={advisor} onChange={onChangeAdvisor} />
					<p style={S.advisorIntro}>
						Reviews the Signal K paths your boat publishes and recommends which
						conversions to enable. Enables apply automatically; anything that
						disables a conversion waits for your approval.
					</p>
					<button
						type="button"
						style={S.btnPrimary}
						onClick={() => void review()}
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
				</div>
			)}
		</section>
	);
}
