import type * as React from "react";
import type { ReviewResult } from "../../../advisor/types.js";
import { S } from "../../styles";

interface Props {
	result: ReviewResult;
	decisions: Record<string, boolean>;
	onApprove: (optionKey: string) => void;
	onReject: (optionKey: string) => void;
}

/** Renders one ReviewResult: the auto-applied list and the pending list. */
export default function ReviewResultView({
	result,
	decisions,
	onApprove,
	onReject,
}: Props): React.ReactElement {
	const empty = result.autoApplied.length === 0 && result.pending.length === 0;

	return (
		<div>
			{result.autoApplied.length > 0 && (
				<div style={S.advisorAutoBlock}>
					<span style={S.advisorBlockTitle}>
						Auto-applied ({result.autoApplied.length})
					</span>
					<ul style={S.advisorList}>
						{result.autoApplied.map((r) => (
							<li key={r.optionKey}>
								Enabled {r.optionKey}
								<div style={S.advisorReason}>{r.reason}</div>
							</li>
						))}
					</ul>
				</div>
			)}
			{result.pending.length > 0 && (
				<div style={S.advisorPendingBlock}>
					<span style={S.advisorBlockTitle}>
						Needs your approval ({result.pending.length})
					</span>
					{result.pending.map((r) => {
						const choice = decisions[r.optionKey];
						return (
							<div key={r.optionKey} style={S.advisorRow}>
								<div style={S.advisorRowHead}>
									<span style={S.advisorRowKey}>
										{r.action === "enable" ? "Enable" : "Disable"} {r.optionKey}
									</span>
									<button
										type="button"
										style={choice === true ? S.btnApproveActive : S.btnApprove}
										aria-pressed={choice === true}
										onClick={() => onApprove(r.optionKey)}
									>
										Approve
									</button>
									<button
										type="button"
										style={choice === false ? S.btnRejectActive : S.btnReject}
										aria-pressed={choice === false}
										onClick={() => onReject(r.optionKey)}
									>
										Reject
									</button>
								</div>
								<div style={S.advisorReason}>{r.reason}</div>
							</div>
						);
					})}
				</div>
			)}
			{empty && (
				<div style={S.advisorNote}>
					No changes recommended. Every live path is already handled.
				</div>
			)}
			{result.notes.map((n) => (
				<div key={n} style={S.advisorNote}>
					{n}
				</div>
			))}
		</div>
	);
}
