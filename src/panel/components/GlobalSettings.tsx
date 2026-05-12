import type * as React from "react";
import { S } from "../styles";

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
				<input
					type="number"
					min={0}
					style={S.input}
					value={value}
					onChange={(e) => onChange(Math.max(0, Number(e.target.value) | 0))}
				/>
			</div>
		</div>
	);
}
