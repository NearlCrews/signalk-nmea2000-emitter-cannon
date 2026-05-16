import type * as React from "react";
import { S } from "../styles";
import SaveStatus from "./SaveStatus";

interface Props {
	dirty: boolean;
	onSave: () => void;
	onDiscard: () => void;
	// Epoch ms of the last successful save, or null. The pill auto-clears
	// from the parent ~2.5s after a save, so this is a simple render flag.
	justSavedAt?: number | null;
}

export default function FooterBar({
	dirty,
	onSave,
	onDiscard,
	justSavedAt,
}: Props): React.ReactElement {
	return (
		<div style={S.footer}>
			<button
				type="button"
				style={S.btnPrimary}
				onClick={onSave}
				disabled={!dirty}
			>
				Save
			</button>
			<button
				type="button"
				style={S.btnSecondary}
				onClick={onDiscard}
				disabled={!dirty}
			>
				Discard
			</button>
			<SaveStatus dirty={dirty} justSavedAt={justSavedAt ?? null} />
		</div>
	);
}
