import type * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_N2K_INSTANCE } from "../../../constants.js";
import { S } from "../../styles";
import { TABLE_STYLES as T } from "../../tableStyles";
import NumberInput from "../NumberInput";

// Module-level sequence so generated row ids stay unique across every
// MappingTable instance in the panel.
let rowIdSeq = 0;

export interface Column<T> {
	header: string;
	render: (row: T, onChange: (next: T) => void, available: string[]) => React.ReactElement;
}

// Single-line text column keyed by an arbitrary string field of the row.
// The `?? ""` keeps the input controlled: a malformed persisted row can carry
// an undefined value, which would otherwise flip the field controlled ->
// uncontrolled and warn. ariaLabel defaults to the header.
export function textColumn<R>(opts: {
	header: string;
	field: keyof R & string;
	placeholder?: string;
	ariaLabel?: string;
	pattern?: string;
}): Column<R> {
	return {
		header: opts.header,
		render: (r, onRow) => (
			<input
				type="text"
				style={S.input}
				value={(r[opts.field] as string | undefined) ?? ""}
				placeholder={opts.placeholder}
				pattern={opts.pattern}
				onChange={(e) => onRow({ ...r, [opts.field]: e.target.value } as R)}
				aria-label={opts.ariaLabel ?? opts.header}
			/>
		),
	};
}

/** Standard string-backed select column for mapping tables. */
export function selectColumn<R>(opts: {
	header: string;
	field: keyof R & string;
	options: { value: string; label: string }[];
	ariaLabel?: string;
	placeholder?: string;
	disabled?: (row: R) => boolean;
}): Column<R> {
	return {
		header: opts.header,
		render: (r, onRow) => (
			<select
				style={S.input}
				value={
					(r[opts.field] as string | undefined) ??
					(opts.placeholder ? "" : (opts.options[0]?.value ?? ""))
				}
				onChange={(e) => onRow({ ...r, [opts.field]: e.target.value } as R)}
				aria-label={opts.ariaLabel ?? opts.header}
				disabled={opts.disabled?.(r) ?? false}
			>
				{opts.placeholder ? (
					<option value="" disabled>
						{opts.placeholder}
					</option>
				) : null}
				{opts.options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		),
	};
}

// Standard "Signal K id" text column used by every per-instance mapping
// editor (engines, batteries, solar chargers, exhaust). The id is the final
// segment of the SK key (e.g. "main", "house", "0"), not the full path.
// ariaLabel defaults to the header; pass it only when the accessible name
// needs more context than the visible header.
export function signalkIdColumn<R extends { signalkId: string }>(opts: {
	header: string;
	placeholder: string;
	ariaLabel?: string;
}): Column<R> {
	return textColumn<R>({ field: "signalkId", pattern: "[A-Za-z0-9]+", ...opts });
}

// Standard NMEA 2000 instance-id number column. Reused for engine, battery,
// charger, exhaust instance fields. Clamps negatives to 0; the `min={0}`
// attribute is advisory only and the wire format is unsigned. ariaLabel
// defaults to the header.
export function instanceIdColumn<R extends { instanceId: number }>(opts: {
	header: string;
	ariaLabel?: string;
}): Column<R> {
	return {
		header: opts.header,
		render: (r, onRow) => (
			<NumberInput
				value={r.instanceId}
				onChange={(n) => onRow({ ...r, instanceId: n } as R)}
				min={0}
				max={MAX_N2K_INSTANCE}
				ariaLabel={opts.ariaLabel ?? opts.header}
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
	const titleId = useId();
	const helpId = useId();
	// Stable per-row ids so React keys survive a mid-list Remove. Rows are
	// plain config objects with no natural id, so generated ids live in a
	// ref aligned by index: an edit replaces the row in place and keeps its
	// id, our Remove splices the matching slot, and Add row appends (covered
	// by the push loop). An external reset that shrinks the list truncates
	// from the end, which is the best available guess without a natural key.
	const idsRef = useRef<string[]>([]);
	const ids = idsRef.current;
	while (ids.length < props.rows.length) ids.push(`skn-row-${rowIdSeq++}`);
	if (ids.length > props.rows.length) ids.length = props.rows.length;

	// Remove is two-step: the first tap arms an inline "Confirm remove"
	// state for that row, the second tap deletes it. The armed state clears
	// on blur or after a short timeout so a stray tap never leaves a live
	// destructive button behind.
	const [confirmId, setConfirmId] = useState<string | null>(null);
	useEffect(() => {
		if (confirmId === null) return;
		const timer = setTimeout(() => setConfirmId(null), 4000);
		return () => clearTimeout(timer);
	}, [confirmId]);

	const removeRow = (i: number): void => {
		ids.splice(i, 1);
		setConfirmId(null);
		props.onChange(props.rows.filter((_, j) => j !== i));
	};

	return (
		<div style={{ marginTop: "var(--skn-space-1)" }}>
			<div id={titleId} style={T.title}>
				{props.title}
			</div>
			{props.helpText ? (
				<div id={helpId} style={S.helpHint}>
					{props.helpText}
				</div>
			) : null}
			<div style={T.wrap}>
				<table
					style={T.table}
					aria-labelledby={titleId}
					aria-describedby={props.helpText ? helpId : undefined}
				>
					<thead>
						<tr style={T.headRow}>
							{props.columns.map((c) => (
								<th key={c.header} scope="col" style={T.headCell}>
									{c.header}
								</th>
							))}
							<th scope="col" style={T.actionCell}>
								<span style={S.visuallyHidden}>Actions</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{props.rows.map((row, i) => {
							const rowId = ids[i] ?? `skn-row-${rowIdSeq++}`;
							ids[i] = rowId;
							const armed = confirmId === rowId;
							return (
								<tr key={rowId}>
									{props.columns.map((c) => (
										<td key={c.header} style={T.cell}>
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
									<td style={T.actionCell}>
										<button
											type="button"
											style={armed ? S.btnDestructiveSmArmed : S.btnDestructiveSm}
											onClick={() => {
												if (armed) removeRow(i);
												else setConfirmId(rowId);
											}}
											onBlur={() => {
												if (armed) setConfirmId(null);
											}}
											aria-label={
												armed
													? `Confirm removing row ${i + 1} from ${props.title}`
													: `Remove row ${i + 1} from ${props.title}`
											}
										>
											{armed ? "Confirm remove" : "Remove"}
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<button
				type="button"
				style={{ ...S.btnSecondary, marginTop: "var(--skn-space-1)" }}
				onClick={() => props.onChange([...props.rows, props.emptyRow()])}
				aria-label={`Add row to ${props.title}`}
			>
				+ Add row
			</button>
		</div>
	);
}
