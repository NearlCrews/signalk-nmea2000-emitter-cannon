import type * as React from "react";
import { Button, Card, Cluster, Code, Stack, Text } from "signalk-nearlcrews-ui";
import type { ConversionMetadata } from "../../../api/types.js";
import type { AdvisorAction, Recommendation, ReviewResult } from "../../../recommendation/types.js";
import { CONVERSION_STYLES as C } from "../../conversionStyles";

interface Props {
	result: ReviewResult;
	// Conversion catalog keyed by option key, used to render the human
	// conversion title instead of the raw option key.
	metaByKey: Map<string, ConversionMetadata>;
	// Approve applies the recommendation immediately; reject dismisses it.
	onApprove: (r: Recommendation) => void;
	onReject: (optionKey: string) => void;
	// True while an advisor request is in flight, so the buttons block a second
	// action without leaving the tab order.
	busy?: boolean;
	// The recommendation whose Approve was pressed, so that button shows the
	// progress and its peers only block.
	applyingKey?: string | null;
}

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

// Conversion title with the option key as secondary monospace text; just the
// key when no catalog entry exists for it.
function ConversionLabel({
	optionKey,
	metaByKey,
}: {
	optionKey: string;
	metaByKey: Map<string, ConversionMetadata>;
}): React.ReactElement {
	const title = metaByKey.get(optionKey)?.title;
	if (!title) return <Code>{optionKey}</Code>;
	return (
		<>
			{title}{" "}
			<Text tone="muted" size="sm">
				<Code>{optionKey}</Code>
			</Text>
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
	applyingKey = null,
}: Props): React.ReactElement {
	const empty = result.autoApplied.length === 0 && result.pending.length === 0;

	return (
		<Stack gap={3}>
			{result.autoApplied.length > 0 && (
				<Card
					tone="success"
					header={<Text as="strong">Auto-applied ({result.autoApplied.length})</Text>}
				>
					<ul style={C.bulletList}>
						{result.autoApplied.map((r) => (
							<li key={r.optionKey}>
								Enabled <ConversionLabel optionKey={r.optionKey} metaByKey={metaByKey} />
								<Text as="div" tone="muted" size="sm">
									{r.reason}
								</Text>
							</li>
						))}
					</ul>
				</Card>
			)}
			{result.pending.length > 0 && (
				<Card
					tone="warning"
					header={<Text as="strong">Needs your approval ({result.pending.length})</Text>}
				>
					<Stack gap={3}>
						{result.pending.map((r) => {
							// The pressed control shows the progress and keeps its name; its
							// peers block activation through aria-disabled. A native
							// disabled attribute would blur the button the user just
							// pressed and drop focus to the document body.
							const applying = busy && applyingKey === r.optionKey;
							return (
								<Stack key={r.optionKey} gap={1}>
									<Cluster justify="between" align="center" gap={2}>
										<Text as="strong">
											{PENDING_VERB[r.action]}{" "}
											<ConversionLabel optionKey={r.optionKey} metaByKey={metaByKey} />
										</Text>
										<Cluster gap={2}>
											<Button
												size="compact"
												variant="primary"
												onClick={() => onApprove(r)}
												loading={applying}
												loadingLabel="Applying"
												ariaDisabled={busy && !applying}
											>
												Approve
											</Button>
											<Button
												size="compact"
												onClick={() => onReject(r.optionKey)}
												ariaDisabled={busy}
											>
												Reject
											</Button>
										</Cluster>
									</Cluster>
									<Text as="div" tone="muted" size="sm">
										{r.reason}
									</Text>
								</Stack>
							);
						})}
					</Stack>
				</Card>
			)}
			{empty && (
				<Text as="p" tone="muted" size="sm">
					No changes recommended. Every live path is already handled.
				</Text>
			)}
			{result.notes.map((n, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: notes are render-only and never reordered, and two notes can be identical strings
				<Text as="p" tone="muted" size="sm" key={`note-${i}`}>
					{n}
				</Text>
			))}
		</Stack>
	);
}
