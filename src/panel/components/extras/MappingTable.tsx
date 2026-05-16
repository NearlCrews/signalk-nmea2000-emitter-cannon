import type * as React from "react";
import { S } from "../../styles";

export interface Column<T> {
	header: string;
	render: (
		row: T,
		onChange: (next: T) => void,
		available: string[],
	) => React.ReactElement;
}

// Standard "Signal K id" text column used by every per-instance mapping
// editor (engines, batteries, solar chargers, exhaust). The id is the final
// segment of the SK key (e.g. "main", "house", "0"), not the full path.
export function signalkIdColumn<R extends { signalkId: string }>(opts: {
	header: string;
	placeholder: string;
	ariaLabel: string;
}): Column<R> {
	return {
		header: opts.header,
		render: (r, onRow) => (
			<input
				type="text"
				style={S.input}
				value={r.signalkId}
				placeholder={opts.placeholder}
				onChange={(e) => onRow({ ...r, signalkId: e.target.value } as R)}
				aria-label={opts.ariaLabel}
			/>
		),
	};
}

// Standard NMEA 2000 instance-id number column. Reused for engine, battery,
// charger, exhaust instance fields. Clamps negatives to 0; the `min={0}`
// attribute is advisory only and the wire format is unsigned.
export function instanceIdColumn<R extends { instanceId: number }>(opts: {
	header: string;
	ariaLabel: string;
}): Column<R> {
	return {
		header: opts.header,
		render: (r, onRow) => (
			<input
				type="number"
				min={0}
				style={S.input}
				value={r.instanceId}
				onChange={(e) =>
					onRow({
						...r,
						instanceId: Math.max(0, Number(e.target.value) | 0),
					} as R)
				}
				aria-label={opts.ariaLabel}
			/>
		),
	};
}

interface Props<T> {
	title: string;
	rows: T[];
	emptyRow: () => T;
	columns: Column<T>[];
	available?: string[];
	onChange: (next: T[]) => void;
	// Optional one-line help text rendered below the title. Used to nudge
	// users about shared identifier conventions across related editors
	// (e.g. signalkId must match across ENGINE_PARAMETERS / STATIC / TRIP).
	helpText?: string;
}

export default function MappingTable<T>(props: Props<T>): React.ReactElement {
	return (
		<div style={{ marginTop: 8 }}>
			<div style={S.tableTitle}>{props.title}</div>
			{props.helpText ? <div style={S.helpHint}>{props.helpText}</div> : null}
			<div style={S.tableWrap}>
				<table style={S.table}>
					<thead>
						<tr style={S.tableHeadRow}>
							{props.columns.map((c) => (
								<th
									key={c.header}
									scope="col"
									style={{ padding: 6, fontWeight: 500 }}
								>
									{c.header}
								</th>
							))}
							<th scope="col" style={{ padding: 6 }}>
								<span style={S.visuallyHidden}>Actions</span>
							</th>
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
								<td style={{ padding: 6 }}>
									<button
										type="button"
										style={S.btnDestructiveSm}
										onClick={() =>
											props.onChange(props.rows.filter((_, j) => j !== i))
										}
										aria-label={`Remove row ${i + 1}`}
									>
										Remove
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
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
