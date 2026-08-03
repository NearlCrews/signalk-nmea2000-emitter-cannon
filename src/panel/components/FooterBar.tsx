import type * as React from "react";
import { useRef } from "react";
import { ActionBar, Button, Cluster } from "signalk-nearlcrews-ui";
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
	validationErrorCount?: number;
	// Epoch ms of the last successful save, or null. The pill auto-clears
	// from the parent ~2.5s after a save, so this is a simple render flag.
	justSavedAt?: number | null;
}

export default function FooterBar({
	dirty,
	unconfigured,
	onSave,
	onDiscard,
	validationErrorCount = 0,
	justSavedAt,
}: Props): React.ReactElement {
	// Save and Discard disable themselves the instant they fire (dirty flips to
	// false), which would drop keyboard focus to <body>. Move focus to the
	// save-status wrapper instead so it lands on a stable, focusable element and
	// a screen reader announces the resulting "Saved" status.
	const statusRef = useRef<HTMLDivElement>(null);
	const focusStatus = (): void => statusRef.current?.focus();

	const handleSave = (): void => {
		onSave();
		focusStatus();
	};
	const handleDiscard = (): void => {
		onDiscard();
		focusStatus();
	};

	const saveDisabled = isSaveDisabled(dirty, unconfigured, validationErrorCount);

	return (
		<ActionBar
			sticky="bottom"
			actions={
				<Cluster gap={2}>
					<Button variant="primary" onClick={handleSave} disabled={saveDisabled}>
						Save
					</Button>
					<Button onClick={handleDiscard} disabled={!dirty}>
						Discard
					</Button>
				</Cluster>
			}
			status={
				<>
					<SaveStatus dirty={dirty} justSavedAt={justSavedAt ?? null} />
					{validationErrorCount > 0 ? (
						<span role="status" style={S.textFaint}>
							Fix {validationErrorCount} configuration{" "}
							{validationErrorCount === 1 ? "error" : "errors"}
							before saving.
						</span>
					) : null}
					{unconfigured && !dirty ? (
						<span style={S.textFaint}>Save to enable the plugin.</span>
					) : null}
				</>
			}
			statusRef={statusRef}
		/>
	);
}
