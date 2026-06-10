import type * as React from "react";
import { GLOBAL_RESEND_HELP } from "../../config/enums.js";
import { S } from "../styles";
import Disclosure from "./Disclosure";
import NumberInput from "./NumberInput";

interface Props {
	value: number;
	onChange: (next: number) => void;
}

const BODY_ID = "skn-global-settings-body";

// Extra gap below the card so the search row does not crowd it.
const CARD: React.CSSProperties = {
	...S.card,
	marginBottom: "var(--skn-space-3)",
};

/**
 * Global settings as a compact collapsible row: the resend interval is set
 * once and rarely revisited, so it should not occupy a permanent card ahead
 * of the conversion catalog. The trailing summary keeps the effective
 * interval visible while the editor is collapsed.
 */
export default function GlobalSettings({
	value,
	onChange,
}: Props): React.ReactElement {
	return (
		<div style={CARD}>
			<Disclosure
				id={BODY_ID}
				label="Global settings"
				bodyStyle={S.cardBody}
				summary={value === 0 ? "global resend off" : `resend every ${value} s`}
			>
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
			</Disclosure>
		</div>
	);
}
