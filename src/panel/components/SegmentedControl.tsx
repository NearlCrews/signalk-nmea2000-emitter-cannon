import type * as React from "react";
import { S } from "../styles";

interface Props<V extends string> {
	// Visually hidden <legend> naming the control for screen readers.
	legend: string;
	choices: ReadonlyArray<{ value: V; label: string }>;
	value: V;
	onChange: (next: V) => void;
	// Optional ref to the <fieldset>, for callers that need the DOM node
	// (ThemeToggle finds the nearest `.skn-panel` ancestor through it).
	fieldsetRef?: React.Ref<HTMLFieldSetElement>;
}

/**
 * Compact segmented control: a bordered fieldset of aria-pressed buttons with
 * the active segment filled by the accent. Shared by the theme toggle and the
 * Configure / Status view switcher. Each segment is a 36px touch target.
 */
export default function SegmentedControl<V extends string>({
	legend,
	choices,
	value,
	onChange,
	fieldsetRef,
}: Props<V>): React.ReactElement {
	return (
		<fieldset ref={fieldsetRef} style={S.segmented}>
			<legend style={S.visuallyHidden}>{legend}</legend>
			{choices.map((c) => (
				<button
					key={c.value}
					type="button"
					aria-pressed={value === c.value}
					style={value === c.value ? S.segmentedBtnActive : S.segmentedBtn}
					onClick={() => onChange(c.value)}
				>
					{c.label}
				</button>
			))}
		</fieldset>
	);
}
