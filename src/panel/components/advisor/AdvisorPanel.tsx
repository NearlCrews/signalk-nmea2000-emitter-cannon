// src/panel/components/advisor/AdvisorPanel.tsx
import type * as React from "react";
import { useState } from "react";
import type { ApplyDecision } from "../../../advisor/types.js";
import { useAdvisor } from "../../hooks/useAdvisor.js";
import ReviewResultView from "./ReviewResultView.js";

/**
 * Collapsible "Config Advisor" section. Phase 1: a Review now button, the
 * result, and per-item Approve/Reject. Settings rows (OpenRouter, QuestDB,
 * schedule) arrive in later phases.
 */
export default function AdvisorPanel(): React.ReactElement {
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
		<section
			style={{
				border: "1px solid #ccc",
				borderRadius: 4,
				margin: "12px 0",
				padding: 8,
			}}
		>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				style={{
					background: "none",
					border: "none",
					font: "inherit",
					cursor: "pointer",
					fontWeight: "bold",
				}}
			>
				{open ? "v" : ">"} Config Advisor
			</button>
			{open && (
				<div style={{ marginTop: 8 }}>
					<p style={{ fontSize: "90%", opacity: 0.8 }}>
						Reviews the Signal K paths your boat publishes and recommends which
						conversions to enable. Enables apply automatically; anything that
						disables a conversion waits for your approval.
					</p>
					<button
						type="button"
						onClick={() => void review()}
						disabled={state.loading}
					>
						{state.loading ? "Reviewing..." : "Review now"}
					</button>
					{state.error && (
						<div role="alert" style={{ color: "#b00", marginTop: 6 }}>
							{state.error}
						</div>
					)}
					{state.result && (
						<div style={{ marginTop: 8 }}>
							<ReviewResultView
								result={state.result}
								onApprove={(k) => decide(k, true)}
								onReject={(k) => decide(k, false)}
							/>
							{state.result.pending.length > 0 && (
								<button
									type="button"
									onClick={applyAll}
									style={{ marginTop: 8 }}
								>
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
