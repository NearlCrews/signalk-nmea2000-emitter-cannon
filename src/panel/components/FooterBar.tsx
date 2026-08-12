import type * as React from "react";
import { useRef } from "react";
import { ActionBar, Button, Cluster } from "signalk-nearlcrews-ui";
import { isSaveDisabled } from "../saveDisabled";
import { S } from "../styles";
import SaveStatus from "./SaveStatus";

interface Props {
	dirty: boolean;
	// True when the host has not yet provided a configuration (first install).
	// In this state Save must stay enabled even when not dirty so the user can
	// request the defaults and enable the plugin.
	unconfigured: boolean;
	onSave: () => void;
	onDiscard: () => void;
	validationErrorCount?: number;
	// Epoch ms of the last save request, or null. The notice auto-clears from
	// the parent after about 2.5 seconds, so this is a simple render flag.
	saveRequestedAt?: number | null;
}

export default function FooterBar({
	dirty,
	unconfigured,
	onSave,
	onDiscard,
	validationErrorCount = 0,
	saveRequestedAt,
}: Props): React.ReactElement {
	// Save and Discard disable themselves the instant they fire (dirty flips to
	// false), which would drop keyboard focus to <body>. Move focus to the
	// save-status wrapper instead so it lands on a stable, focusable element and
	// a screen reader announces the resulting completion status.
	const statusRef = useRef<HTMLDivElement>(null);
	const focusStatus = (): void => {
		requestAnimationFrame(() => statusRef.current?.focus());
	};

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
			sticky="viewport-bottom"
			data-panel-action-bar=""
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
					<SaveStatus
						dirty={dirty}
						unconfigured={unconfigured}
						saveRequestedAt={saveRequestedAt ?? null}
					/>
					{validationErrorCount > 0 ? (
						<span role="status" style={S.textFaint}>
							Fix {validationErrorCount} configuration{" "}
							{validationErrorCount === 1 ? "error" : "errors"}
							before saving.
						</span>
					) : null}
				</>
			}
			statusRef={statusRef}
		/>
	);
}
