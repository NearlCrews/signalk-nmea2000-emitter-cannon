import type * as React from "react";
import { useState } from "react";
import { GLOBAL_RESEND_HELP } from "../../config/enums.js";
import { S } from "../styles";
import DisclosureCaret from "./DisclosureCaret";
import NumberInput from "./NumberInput";

interface Props {
	value: number;
	onChange: (next: number) => void;
}

const BODY_ID = "skn-global-settings-body";

// Trailing summary on the disclosure row so the effective interval stays
// visible while the editor is collapsed.
const SUMMARY: React.CSSProperties = {
	...S.cardMeta,
	fontWeight: 400,
	marginLeft: "auto",
};

/**
 * Global settings as a compact collapsible row: the resend interval is set
 * once and rarely revisited, so it should not occupy a permanent card ahead
 * of the conversion catalog.
 */
export default function GlobalSettings({
	value,
	onChange,
}: Props): React.ReactElement {
	const [open, setOpen] = useState(false);
	return (
		<div style={{ ...S.card, marginBottom: "var(--skn-space-3)" }}>
			<button
				type="button"
				style={S.advisorToggle}
				aria-expanded={open}
				aria-controls={BODY_ID}
				onClick={() => setOpen((o) => !o)}
			>
				<DisclosureCaret expanded={open} />
				Global settings
				<span style={SUMMARY}>
					{value === 0 ? "global resend off" : `resend every ${value} s`}
				</span>
			</button>
			{open ? (
				<div id={BODY_ID} style={S.cardBody}>
					<div style={S.fieldRow}>
						<span style={S.label}>Global resend interval (seconds)</span>
						<NumberInput
							value={value}
							onChange={onChange}
							min={0}
							ariaLabel="Global resend interval in seconds"
						/>
					</div>
					<p style={S.helpHint}>{GLOBAL_RESEND_HELP}</p>
				</div>
			) : (
				// Placeholder keeps the header's aria-controls target present
				// while collapsed.
				<div id={BODY_ID} hidden />
			)}
		</div>
	);
}
