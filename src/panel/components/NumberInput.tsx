import type * as React from "react";
import { useState } from "react";
import { S } from "../styles";

interface BaseProps {
	value: number | undefined;
	min?: number;
	placeholder?: string;
	ariaLabel: string;
}

// `allowEmpty` widens `onChange` to emit `undefined` for a cleared field.
// Without it a cleared field commits `min`, so `onChange` only ever sees a
// number. Used for optional fields such as rated engine speed.
type Props = BaseProps &
	(
		| { allowEmpty?: false; onChange: (next: number) => void }
		| { allowEmpty: true; onChange: (next: number | undefined) => void }
	);

// Integer input that holds a raw-text draft while the user edits, so the
// field can be cleared mid-edit instead of snapping back to a number on
// every keystroke. Commits a clamped, truncated integer (or `undefined`).
export default function NumberInput(props: Props): React.ReactElement {
	const { value, min = 0, placeholder, ariaLabel } = props;
	const [draft, setDraft] = useState<string | null>(null);

	const commit = (raw: string): void => {
		if (raw.trim() === "") {
			if (props.allowEmpty) props.onChange(undefined);
			else props.onChange(min);
			return;
		}
		const n = Number(raw);
		props.onChange(Number.isFinite(n) ? Math.max(min, Math.trunc(n)) : min);
	};

	return (
		<input
			type="number"
			min={min}
			style={S.input}
			value={draft ?? (value === undefined ? "" : String(value))}
			placeholder={placeholder}
			onChange={(e) => {
				setDraft(e.target.value);
				commit(e.target.value);
			}}
			onBlur={() => setDraft(null)}
			aria-label={ariaLabel}
		/>
	);
}
