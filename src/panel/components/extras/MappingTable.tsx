import type * as React from "react";
import { S } from "../../styles";

interface Column<T> {
	header: string;
	render: (
		row: T,
		onChange: (next: T) => void,
		available: string[],
	) => React.ReactElement;
}

interface Props<T> {
	title: string;
	rows: T[];
	emptyRow: () => T;
	columns: Column<T>[];
	available?: string[];
	onChange: (next: T[]) => void;
}

export default function MappingTable<T>(props: Props<T>): React.ReactElement {
	return (
		<div style={{ marginTop: 8 }}>
			<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
				{props.title}
			</div>
			<table
				style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
			>
				<thead>
					<tr style={{ textAlign: "left", color: "#666" }}>
						{props.columns.map((c) => (
							<th key={c.header} style={{ padding: 6, fontWeight: 500 }}>
								{c.header}
							</th>
						))}
						<th />
					</tr>
				</thead>
				<tbody>
					{props.rows.map((row, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: rows have no natural id; index is the only stable handle for add/remove
						<tr key={i}>
							{props.columns.map((c) => (
								<td key={c.header} style={{ padding: 6 }}>
									{c.render(
										row,
										(next) => {
											const out = props.rows.slice();
											out[i] = next;
											props.onChange(out);
										},
										props.available ?? [],
									)}
								</td>
							))}
							<td>
								<button
									type="button"
									style={S.btnSecondary}
									onClick={() =>
										props.onChange(props.rows.filter((_, j) => j !== i))
									}
								>
									Remove
								</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<button
				type="button"
				style={{ ...S.btnSecondary, marginTop: 6 }}
				onClick={() => props.onChange([...props.rows, props.emptyRow()])}
			>
				+ Add row
			</button>
		</div>
	);
}
