import type * as React from "react";
import type { CSSProperties } from "react";
import type { ConversionMetadata } from "../../../api/types.js";
import type { AdvisorAction, Recommendation, ReviewResult } from "../../../recommendation/types.js";
import { ADVISOR_STYLES as A } from "../../advisorStyles";
import { S } from "../../styles";

interface Props {
	result: ReviewResult;
	// Conversion catalog keyed by option key, used to render the human
	// conversion title instead of the raw option key.
	metaByKey: Map<string, ConversionMetadata>;
	// Approve applies the recommendation immediately; reject dismisses it.
	onApprove: (r: Recommendation) => void;
	onReject: (optionKey: string) => void;
	// True while an apply is in flight, so the buttons disable to avoid a
	// double action.
	busy?: boolean;
}

// The raw option key as small secondary text after the conversion title.
const KEY_SUFFIX: CSSProperties = {
	...S.cardMeta,
	fontWeight: 400,
	marginLeft: "var(--skn-space-compact)",
};

// Action verb shown before the conversion label in the pending list. Keyed by
// AdvisorAction so a new action surfaces here as a type error rather than
// falling through a default. "keep" never reaches the pending list but is
// present for exhaustiveness.
const PENDING_VERB: Record<AdvisorAction, string> = {
	enable: "Enable",
	disable: "Disable",
	"clear-source": "Fix source for",
	keep: "Keep",
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
	metaByKey,
	onApprove,
	onReject,
	busy = false,
}: Props): React.ReactElement {
	const empty = result.autoApplied.length === 0 && result.pending.length === 0;

	return (
		<div>
			{result.autoApplied.length > 0 && (
				<div style={A.autoBlock}>
					<span style={A.blockTitle}>Auto-applied ({result.autoApplied.length})</span>
					<ul style={A.list}>
						{result.autoApplied.map((r) => (
							<li key={r.optionKey}>
								Enabled <ConversionLabel optionKey={r.optionKey} metaByKey={metaByKey} />
								<div style={A.reason}>{r.reason}</div>
							</li>
						))}
					</ul>
				</div>
			)}
			{result.pending.length > 0 && (
				<div style={A.pendingBlock}>
					<span style={A.blockTitle}>Needs your approval ({result.pending.length})</span>
					{result.pending.map((r) => {
						const verb = PENDING_VERB[r.action];
						return (
							<div key={r.optionKey} style={A.row}>
								<div style={A.rowHead}>
									<span style={A.rowKey}>
										{verb} <ConversionLabel optionKey={r.optionKey} metaByKey={metaByKey} />
									</span>
									<button
										type="button"
										style={A.approveButton}
										onClick={() => onApprove(r)}
										disabled={busy}
									>
										Approve
									</button>
									<button
										type="button"
										style={A.rejectButton}
										onClick={() => onReject(r.optionKey)}
										disabled={busy}
									>
										Reject
									</button>
								</div>
								<div style={A.reason}>{r.reason}</div>
							</div>
						);
					})}
				</div>
			)}
			{empty && (
				<div style={A.note}>No changes recommended. Every live path is already handled.</div>
			)}
			{result.notes.map((n, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: notes are render-only and never reordered, and two notes can be identical strings
				<div key={`note-${i}`} style={A.note}>
					{n}
				</div>
			))}
		</div>
	);
}
