import type * as React from "react";
import type { ExtrasFieldSpec, ExtrasMeta } from "../../../api/types.js";
import { S } from "../../styles";

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
	const update = (next: unknown): void =>
		onChange({ ...value, [spec.key]: next });
	return (
		<div style={S.fieldRow}>
			<span style={S.label}>{spec.label}</span>
			{spec.control === "boolean" ? (
				<input
					type="checkbox"
					style={S.checkbox}
					checked={Boolean(v)}
					onChange={(e) => update(e.target.checked)}
					aria-label={spec.label}
				/>
			) : spec.control === "number" ? (
				<input
					type="number"
					style={S.input}
					value={Number(v) || 0}
					onChange={(e) => update(Number(e.target.value))}
					aria-label={spec.label}
				/>
			) : (
				<input
					type="text"
					style={S.input}
					value={String(v)}
					onChange={(e) => update(e.target.value)}
					aria-label={spec.label}
				/>
			)}
		</div>
	);
}

export default function FieldEditor({
	meta,
	value,
	onChange,
}: Props): React.ReactElement {
	if (meta.type === "fields") {
		return (
			<>
				{meta.fields.map((spec) => (
					<FieldRow
						key={spec.key}
						spec={spec}
						value={value}
						onChange={onChange}
					/>
				))}
			</>
		);
	}
	return <FieldRow spec={meta} value={value} onChange={onChange} />;
}
