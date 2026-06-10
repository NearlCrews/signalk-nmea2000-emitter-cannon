import type * as React from "react";
import type { CSSProperties } from "react";
import type { ReviewResult } from "../../../advisor/types.js";
import type { ConversionMetadata } from "../../../api/types.js";
import { S } from "../../styles";

interface Props {
	result: ReviewResult;
	decisions: Record<string, boolean>;
	// Conversion catalog keyed by option key, used to render the human
	// conversion title instead of the raw option key.
	metaByKey: Map<string, ConversionMetadata>;
	onApprove: (optionKey: string) => void;
	onReject: (optionKey: string) => void;
}

// The raw option key as small secondary text after the conversion title.
const KEY_SUFFIX: CSSProperties = {
	fontSize: "var(--skn-font-small)",
	fontWeight: 400,
	color: "var(--skn-text-faint)",
	marginLeft: 6,
};

// Conversion title with the option key as secondary text; just the key when
// no catalog entry exists for it.
function ConversionLabel({
	optionKey,
	metaByKey,
}: {
	optionKey: string;
	metaByKey: Map<string, ConversionMetadata>;
}): React.ReactElement {
	const title = metaByKey.get(optionKey)?.title;
	if (!title) return <>{optionKey}</>;
	return (
		<>
			{title}
			<span style={KEY_SUFFIX}>{optionKey}</span>
		</>
	);
}

/** Renders one ReviewResult: the auto-applied list and the pending list. */
export default function ReviewResultView({
	result,
	decisions,
	metaByKey,
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
								Enabled{" "}
								<ConversionLabel
									optionKey={r.optionKey}
									metaByKey={metaByKey}
								/>
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
										{r.action === "enable" ? "Enable" : "Disable"}{" "}
										<ConversionLabel
											optionKey={r.optionKey}
											metaByKey={metaByKey}
										/>
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
			{result.notes.map((n, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: notes are render-only and never reordered, and two notes can be identical strings
				<div key={`note-${i}`} style={S.advisorNote}>
					{n}
				</div>
			))}
		</div>
	);
}
