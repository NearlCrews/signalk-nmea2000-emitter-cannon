import type * as React from "react";
import { S } from "../styles";

interface Props {
	dirty: boolean;
	/** Epoch ms of the last successful save, or null. */
	justSavedAt: number | null;
}

/** The "Unsaved changes" / "Saved" indicator shared by the footer and the advisor save controls. */
export default function SaveStatus({
	dirty,
	justSavedAt,
}: Props): React.ReactElement | null {
	if (dirty) return <span style={S.dirty}>Unsaved changes</span>;
	if (justSavedAt) {
		return (
			<span role="status" style={S.savedPill}>
				Saved
			</span>
		);
	}
	return null;
}
