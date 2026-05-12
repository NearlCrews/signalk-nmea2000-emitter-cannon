import type * as React from "react";
import type { ExtrasMeta } from "../../../api/types.js";
import { S } from "../../styles";

interface Props {
	meta: Extract<ExtrasMeta, { type: "field" }>;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function FieldEditor({
	meta,
	value,
	onChange,
}: Props): React.ReactElement {
	const v = value[meta.key] ?? meta.default ?? "";
	const update = (next: unknown): void =>
		onChange({ ...value, [meta.key]: next });
	return (
		<div style={S.fieldRow}>
			<span style={S.label}>{meta.label}</span>
			{meta.control === "boolean" ? (
				<input
					type="checkbox"
					style={S.checkbox}
					checked={Boolean(v)}
					onChange={(e) => update(e.target.checked)}
				/>
			) : meta.control === "number" ? (
				<input
					type="number"
					style={S.input}
					value={Number(v) || 0}
					onChange={(e) => update(Number(e.target.value))}
				/>
			) : (
				<input
					type="text"
					style={S.input}
					value={String(v)}
					onChange={(e) => update(e.target.value)}
				/>
			)}
		</div>
	);
}
