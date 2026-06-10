import type * as React from "react";
import { S } from "../styles";
import NumberInput from "./NumberInput";

interface Props {
	value: number;
	onChange: (next: number) => void;
}

export default function GlobalSettings({
	value,
	onChange,
}: Props): React.ReactElement {
	return (
		<div style={{ ...S.card, marginBottom: 16 }}>
			<div style={S.fieldRow}>
				<span style={S.label}>Global Resend Interval (seconds)</span>
				<NumberInput
					value={value}
					onChange={onChange}
					min={0}
					ariaLabel="Global resend interval in seconds"
				/>
			</div>
			<p style={S.helpHint}>
				Seconds between automatic re-emits of each conversion's most recent
				value. Set 0 to disable global resend; a conversion can still opt in
				with its own resend interval.
			</p>
		</div>
	);
}
