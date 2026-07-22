import type * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_N2K_INSTANCE } from "../../../constants.js";
import { SIGNALK_ID_SEGMENT_PATTERN } from "../../../utils/validation.js";
import { S } from "../../styles";
import { TABLE_STYLES as T } from "../../tableStyles";
import NumberInput from "../NumberInput";
import { mappingInputStatus, type RequiredInput } from "./mappingInputStatus";

export type { RequiredInput } from "./mappingInputStatus";

// Module-level sequence so generated row ids stay unique across every
// MappingTable instance in the panel.
let rowIdSeq = 0;

export interface Column<T> {
	header: string;
	group?: "Signal K input" | "NMEA 2000 output" | "Configuration";
	render: (
		row: T,
		onChange: (next: T) => void,
		available: string[],
		controlId: string,
	) => React.ReactElement;
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
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
	group?: Column<R>["group"];
	suggestions?: (available: string[]) => string[];
	assetPrefix?: (value: string) => string;
	requiredInput?: (row: R) => RequiredInput | undefined;
}): Column<R> {
	return {
		header: opts.header,
		...(opts.group === undefined ? {} : { group: opts.group }),
		render: (r, onRow, available, controlId) => {
			const value = (r[opts.field] as string | undefined) ?? "";
			const suggestions = uniqueSorted(opts.suggestions?.(available) ?? []);
			const listId = suggestions.length > 0 ? `${controlId}-choices` : undefined;
			const assetPath = value && opts.assetPrefix ? opts.assetPrefix(value) : undefined;
			const requiredInput = opts.requiredInput?.(r);
			const status = assetPath
				? mappingInputStatus(assetPath, available, requiredInput)
				: undefined;
			return (
				<div>
					<input
						id={controlId}
						type="text"
						style={S.input}
						value={value}
						placeholder={opts.placeholder}
						pattern={opts.pattern}
						list={listId}
						onChange={(e) => onRow({ ...r, [opts.field]: e.target.value } as R)}
						aria-label={opts.ariaLabel ?? opts.header}
					/>
					{listId ? (
						<datalist id={listId}>
							{suggestions.map((suggestion) => (
								<option key={suggestion} value={suggestion} />
							))}
						</datalist>
					) : null}
					{status && available.length > 0 ? (
						<div>
							<div style={status.assetFound ? S.mappingLive : S.mappingMissing}>
								{status.assetFound ? "Asset found" : "Asset not found"}
							</div>
							{requiredInput && status.assetFound ? (
								<div style={status.requiredInputFound ? S.mappingLive : S.mappingMissing}>
									{status.requiredInputFound ? "Required input found" : "Required input missing"}:{" "}
									{requiredInput.label}
								</div>
							) : null}
						</div>
					) : null}
				</div>
			);
		},
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
	group?: Column<R>["group"];
}): Column<R> {
	return {
		header: opts.header,
		...(opts.group === undefined ? {} : { group: opts.group }),
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
// segment of the SK key (e.g. "main", "house", "258-second"), not the full
// path. Hyphens and underscores accommodate established provider output while
// dots, slashes, and whitespace remain invalid.
// ariaLabel defaults to the header; pass it only when the accessible name
// needs more context than the visible header.
export function signalkIdColumn<R extends { signalkId: string }>(opts: {
	header: string;
	placeholder: string;
	ariaLabel?: string;
	pathPrefix?: string;
	requiredInput?: (row: R) => RequiredInput | undefined;
}): Column<R> {
	const { pathPrefix, ...textOptions } = opts;
	return textColumn<R>({
		field: "signalkId",
		pattern: SIGNALK_ID_SEGMENT_PATTERN,
		group: "Signal K input",
		...textOptions,
		...(pathPrefix
			? {
					suggestions: (available: string[]) => {
						const prefix = `${pathPrefix}.`;
						return available.flatMap((path) => {
							if (!path.startsWith(prefix)) return [];
							const id = path.slice(prefix.length).split(".")[0];
							return id ? [id] : [];
						});
					},
					assetPrefix: (value: string) => `${pathPrefix}.${value}`,
				}
			: {}),
	});
}

/** A full Signal K asset path with live-path suggestions and status. */
export function signalkPathColumn<R>(opts: {
	header: string;
	field: keyof R & string;
	placeholder: string;
	pathPattern: RegExp;
	ariaLabel?: string;
	pattern?: string;
	requiredInput?: (row: R) => RequiredInput | undefined;
}): Column<R> {
	return textColumn<R>({
		...opts,
		group: "Signal K input",
		suggestions: (available) =>
			available.flatMap((path) => {
				const match = path.match(opts.pathPattern);
				return match?.[1] ? [match[1]] : [];
			}),
		assetPrefix: (value) => value,
	});
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
		group: "NMEA 2000 output",
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
	/** Config collection used to associate validation issues with this table. */
	collection: string;
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
	const columnGroups = props.columns.reduce<Array<{ label: string; count: number; key: string }>>(
		(groups, column) => {
			const label = column.group ?? "Configuration";
			const last = groups[groups.length - 1];
			if (last?.label === label) {
				last.count++;
				last.key += `:${column.header}`;
			} else groups.push({ label, count: 1, key: `${label}:${column.header}` });
			return groups;
		},
		[],
	);

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
			<section
				style={T.wrap}
				data-mapping-collection={props.collection}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the horizontally scrollable table region must be keyboard focusable.
				tabIndex={0}
				aria-labelledby={titleId}
				aria-describedby={props.helpText ? helpId : undefined}
			>
				<table
					style={T.table}
					aria-labelledby={titleId}
					aria-describedby={props.helpText ? helpId : undefined}
				>
					<thead>
						<tr style={T.groupRow}>
							{columnGroups.map((group) => (
								<th key={group.key} colSpan={group.count} scope="colgroup" style={T.groupCell}>
									{group.label}
								</th>
							))}
							<th rowSpan={2} scope="col" style={T.actionCell}>
								<span style={S.visuallyHidden}>Actions</span>
							</th>
						</tr>
						<tr style={T.headRow}>
							{props.columns.map((c) => (
								<th key={c.header} scope="col" style={T.headCell}>
									{c.header}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{props.rows.map((row, i) => {
							const rowId = ids[i] ?? `skn-row-${rowIdSeq++}`;
							ids[i] = rowId;
							const armed = confirmId === rowId;
							return (
								<tr key={rowId}>
									{props.columns.map((c, columnIndex) => (
										<td key={c.header} style={T.cell}>
											{c.render(
												row,
												(next) => {
													const out = props.rows.slice();
													out[i] = next;
													props.onChange(out);
												},
												props.available ?? [],
												`${rowId}-${columnIndex}`,
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
			</section>
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
