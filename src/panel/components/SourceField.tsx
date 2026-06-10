import type * as React from "react";
import { useEffect, useState } from "react";
import { S } from "../styles";

interface Props {
	path: string;
	value: string;
	onChange: (next: string) => void;
	sourcesFor: (path: string) => string[];
	ensureLoaded: (path: string) => Promise<void>;
	// Disambiguates the datalist id when two rendered fields share a path
	// (e.g. two expanded conversion cards subscribing to the same Signal K
	// key). Pass the conversion option key. Omitting it preserves the
	// original `sources-<path>` id.
	idScope?: string;
}

export default function SourceField({
	path,
	value,
	onChange,
	sourcesFor,
	ensureLoaded,
	idScope,
}: Props): React.ReactElement {
	const [touched, setTouched] = useState(false);
	useEffect(() => {
		if (touched) void ensureLoaded(path);
	}, [path, touched, ensureLoaded]);
	const sources = sourcesFor(path);
	const listId =
		idScope === undefined ? `sources-${path}` : `sources-${idScope}-${path}`;

	// A single <input> with a <datalist> rather than swapping between an
	// <input> and a <select>: swapping element types unmounts the focused node
	// mid-interaction and drops keyboard focus. The datalist offers discovered
	// sources as suggestions once they load on focus, while still allowing a
	// free-form source for paths with no discovered source. An empty value
	// means "any source".
	return (
		<div style={S.fieldRow}>
			<span style={S.label}>Source for {path}</span>
			<input
				style={S.input}
				type="text"
				list={listId}
				value={value}
				placeholder="any source"
				onChange={(e) => onChange(e.target.value)}
				onFocus={() => setTouched(true)}
				aria-label={`Source for ${path}`}
			/>
			<datalist id={listId}>
				{sources.map((s) => (
					<option key={s} value={s} />
				))}
			</datalist>
		</div>
	);
}
