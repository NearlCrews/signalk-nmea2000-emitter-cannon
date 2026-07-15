import type * as React from "react";
import type { ExtrasFieldSpec, ExtrasMeta } from "../../../api/types.js";
import { S } from "../../styles";
import NumberInput from "../NumberInput";

interface Props {
	meta: Extract<ExtrasMeta, { type: "field" } | { type: "fields" }>;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

function FieldRow({
	spec,
	value,
	onChange,
}: {
	spec: ExtrasFieldSpec;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}): React.ReactElement {
	const v = value[spec.key] ?? spec.default ?? "";
	const update = (next: unknown): void => onChange({ ...value, [spec.key]: next });

	let control: React.ReactElement;
	if (spec.control === "boolean") {
		control = (
			<input
				type="checkbox"
				style={S.checkbox}
				checked={Boolean(v)}
				onChange={(e) => update(e.target.checked)}
				aria-label={spec.label}
			/>
		);
	} else if (spec.control === "number") {
		control = (
			<NumberInput
				value={Number(v) || 0}
				{...(spec.min === undefined ? {} : { min: spec.min })}
				{...(spec.max === undefined ? {} : { max: spec.max })}
				onChange={update}
				ariaLabel={spec.label}
			/>
		);
	} else if (spec.control === "select") {
		// Fall back to the "Default" sentinel ("") when the saved value is no
		// longer one of the options (e.g. after a canboat enum rename), so the
		// control never shows the first option while holding a stale string.
		const current = String(v);
		const selected = spec.options.some((o) => o.value === current) ? current : "";
		control = (
			<select
				style={S.input}
				value={selected}
				onChange={(e) => update(e.target.value)}
				aria-label={spec.label}
			>
				{spec.options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		);
	} else {
		control = (
			<input
				type="text"
				style={S.input}
				value={String(v)}
				onChange={(e) => update(e.target.value)}
				aria-label={spec.label}
			/>
		);
	}

	return (
		<div style={S.fieldRow}>
			<span style={S.label}>{spec.label}</span>
			{control}
		</div>
	);
}

export default function FieldEditor({ meta, value, onChange }: Props): React.ReactElement {
	if (meta.type === "fields") {
		return (
			<>
				{meta.fields.map((spec) => (
					<FieldRow key={spec.key} spec={spec} value={value} onChange={onChange} />
				))}
			</>
		);
	}
	return <FieldRow spec={meta} value={value} onChange={onChange} />;
}
