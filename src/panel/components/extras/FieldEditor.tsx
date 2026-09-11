import type * as React from "react";
import {
	Checkbox,
	LabeledField,
	NumberField,
	Select,
	Stack,
	TextInput,
} from "signalk-nearlcrews-ui";
import type { ExtrasFieldSpec, ExtrasMeta } from "../../../api/types.js";
import { isKnownOption, unknownOptionLabel } from "../../selectOptions";

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

	if (spec.control === "boolean") {
		return (
			<Checkbox
				label={spec.label}
				checked={Boolean(v)}
				onChange={(e) => update(e.target.checked)}
			/>
		);
	}
	if (spec.control === "number") {
		return (
			<NumberField
				label={spec.label}
				layout="inline"
				value={Number(v) || 0}
				onValueChange={update}
				min={spec.min ?? 0}
				max={spec.max}
				integer
				fallback={spec.min ?? 0}
			/>
		);
	}
	if (spec.control === "select") {
		const current = String(v);
		// A stored value the list no longer offers keeps its own option, so an
		// unrecognized config is visible rather than silently rewritten.
		const known = isKnownOption(
			current,
			spec.options.map((option) => option.value),
		);
		return (
			<LabeledField label={spec.label} layout="inline">
				<Select value={current} onChange={(e) => update(e.target.value)}>
					{known ? null : <option value={current}>{unknownOptionLabel(current)}</option>}
					{spec.options.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</Select>
			</LabeledField>
		);
	}
	return (
		<LabeledField label={spec.label} layout="inline">
			<TextInput type="text" value={String(v)} onChange={(e) => update(e.target.value)} />
		</LabeledField>
	);
}

export default function FieldEditor({ meta, value, onChange }: Props): React.ReactElement {
	if (meta.type === "fields") {
		return (
			<Stack gap={2}>
				{meta.fields.map((spec) => (
					<FieldRow key={spec.key} spec={spec} value={value} onChange={onChange} />
				))}
			</Stack>
		);
	}
	return <FieldRow spec={meta} value={value} onChange={onChange} />;
}
