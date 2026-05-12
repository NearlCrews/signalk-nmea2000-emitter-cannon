import type * as React from "react";
import { S } from "../styles";

interface Props {
	dirty: boolean;
	onSave: () => void;
	onDiscard: () => void;
}

export default function FooterBar({
	dirty,
	onSave,
	onDiscard,
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
			{dirty ? <span style={S.dirty}>Unsaved changes</span> : null}
		</div>
	);
}
