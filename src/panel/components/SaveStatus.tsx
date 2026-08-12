import type * as React from "react";
import { resolveSaveStatus } from "../saveStatusState";
import { S } from "../styles";

interface Props {
	dirty: boolean;
	unconfigured: boolean;
	/** Epoch ms of the last save request, or null. */
	saveRequestedAt: number | null;
}

/** The save state shown in the footer's persistent completion-status region. */
export default function SaveStatus({
	dirty,
	unconfigured,
	saveRequestedAt,
}: Props): React.ReactElement {
	const status = resolveSaveStatus(dirty, unconfigured, saveRequestedAt);
	return (
		<span
			role="status"
			style={
				status.kind === "dirty" ? S.dirty : status.kind === "requested" ? S.savedPill : S.textFaint
			}
		>
			{status.message}
		</span>
	);
}
