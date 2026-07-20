import type * as React from "react";
import { useState } from "react";
import { NumberInput as SharedNumberInput } from "signalk-nearlcrews-ui";
import { clamp } from "../../utils/validation.js";
import { S } from "../styles";

interface BaseProps {
	value: number | undefined;
	min?: number;
	max?: number;
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
// Inside mapping-table cells the THEME_STYLE td rule overrides S.input's
// fixed width so the field flexes with its column.
export default function NumberInput(props: Props): React.ReactElement {
	const { value, min = 0, max, placeholder, ariaLabel } = props;
	const [draft, setDraft] = useState<string | null>(null);

	const commit = (raw: string): void => {
		if (raw.trim() === "") {
			if (props.allowEmpty) props.onChange(undefined);
			else props.onChange(min);
			return;
		}
		const n = Number(raw);
		props.onChange(
			Number.isFinite(n) ? clamp(Math.trunc(n), min, max ?? Number.POSITIVE_INFINITY) : min,
		);
	};

	return (
		<SharedNumberInput
			min={min}
			max={max}
			style={S.input}
			value={draft ?? (value === undefined ? "" : String(value))}
			placeholder={placeholder}
			onChange={(e) => {
				setDraft(e.target.value);
				commit(e.target.value);
			}}
			onBlur={() => setDraft(null)}
			onWheel={(e) => {
				// A scroll gesture over a focused number field silently spins the
				// value. Dropping focus before the spin applies makes scrolling
				// past the field safe; an unfocused number input never spins.
				if (document.activeElement === e.currentTarget) e.currentTarget.blur();
			}}
			aria-label={ariaLabel}
		/>
	);
}
