import type * as React from "react";
import { useRef } from "react";
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
	// Save and Discard disable themselves the instant they fire (dirty flips to
	// false), which would drop keyboard focus to <body>. Move focus to the
	// save-status wrapper instead so it lands on a stable, focusable element and
	// a screen reader announces the resulting "Saved" status.
	const statusRef = useRef<HTMLSpanElement>(null);
	const focusStatus = (): void => statusRef.current?.focus();

	const handleSave = (): void => {
		onSave();
		focusStatus();
	};
	const handleDiscard = (): void => {
		onDiscard();
		focusStatus();
	};

	return (
		<div style={S.footer}>
			<button
				type="button"
				style={S.btnPrimary}
				onClick={handleSave}
				disabled={!dirty}
			>
				Save
			</button>
			<button
				type="button"
				style={S.btnSecondary}
				onClick={handleDiscard}
				disabled={!dirty}
			>
				Discard
			</button>
			<span ref={statusRef} tabIndex={-1} style={S.saveStatusFocus}>
				<SaveStatus dirty={dirty} justSavedAt={justSavedAt ?? null} />
			</span>
		</div>
	);
}
