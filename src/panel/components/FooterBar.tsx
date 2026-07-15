import type * as React from "react";
import { useRef } from "react";
import { isSaveDisabled } from "../saveDisabled";
import { S } from "../styles";
import SaveStatus from "./SaveStatus";

interface Props {
	dirty: boolean;
	// True when the host has not yet provided a saved configuration (first
	// install). In this state Save must stay enabled even when not dirty so the
	// user can commit defaults and enable the plugin.
	unconfigured: boolean;
	onSave: () => void;
	onDiscard: () => void;
	// Epoch ms of the last successful save, or null. The pill auto-clears
	// from the parent ~2.5s after a save, so this is a simple render flag.
	justSavedAt?: number | null;
}

export default function FooterBar({
	dirty,
	unconfigured,
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

	const saveDisabled = isSaveDisabled(dirty, unconfigured);

	return (
		<div style={S.footer}>
			<button type="button" style={S.btnPrimary} onClick={handleSave} disabled={saveDisabled}>
				Save
			</button>
			<button type="button" style={S.btnSecondary} onClick={handleDiscard} disabled={!dirty}>
				Discard
			</button>
			<span ref={statusRef} tabIndex={-1} style={S.saveStatusFocus}>
				<SaveStatus dirty={dirty} justSavedAt={justSavedAt ?? null} />
			</span>
			{unconfigured && !dirty ? <span style={S.textFaint}>Save to enable the plugin.</span> : null}
		</div>
	);
}
