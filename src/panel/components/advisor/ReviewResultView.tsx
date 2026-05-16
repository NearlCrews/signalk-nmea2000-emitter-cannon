// src/panel/components/advisor/ReviewResultView.tsx
import type * as React from "react";
import type { ReviewResult } from "../../../advisor/types.js";

interface Props {
	result: ReviewResult;
	onApprove: (optionKey: string) => void;
	onReject: (optionKey: string) => void;
}

/** Renders one ReviewResult: the auto-applied list and the pending list. */
export default function ReviewResultView({
	result,
	onApprove,
	onReject,
}: Props): React.ReactElement {
	return (
		<div>
			<div
				style={{
					background: "#e8f5e9",
					padding: 8,
					borderRadius: 4,
					marginBottom: 8,
				}}
			>
				<strong>Auto-applied ({result.autoApplied.length})</strong>
				<ul>
					{result.autoApplied.map((r) => (
						<li key={r.optionKey} title={r.reason}>
							Enabled {r.optionKey}
						</li>
					))}
				</ul>
			</div>
			<div style={{ background: "#fff8e1", padding: 8, borderRadius: 4 }}>
				<strong>Needs your approval ({result.pending.length})</strong>
				{result.pending.map((r) => (
					<div
						key={r.optionKey}
						style={{
							borderTop: "1px solid #e0d8b0",
							paddingTop: 6,
							marginTop: 6,
						}}
					>
						<div>
							<strong>
								{r.action === "disable" ? "Disable" : r.action} {r.optionKey}
							</strong>{" "}
							<button type="button" onClick={() => onApprove(r.optionKey)}>
								Approve
							</button>{" "}
							<button type="button" onClick={() => onReject(r.optionKey)}>
								Reject
							</button>
						</div>
						<div style={{ fontSize: "90%", opacity: 0.8 }}>{r.reason}</div>
					</div>
				))}
			</div>
			{result.notes.map((n) => (
				<div key={n} style={{ fontSize: "90%", opacity: 0.7, marginTop: 6 }}>
					{n}
				</div>
			))}
		</div>
	);
}
