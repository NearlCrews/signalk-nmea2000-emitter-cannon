import type * as React from "react";
import { useEffect, useState } from "react";
import { S } from "../styles";

interface Props {
	path: string;
	value: string;
	onChange: (next: string) => void;
	sourcesFor: (path: string) => string[];
	ensureLoaded: (path: string) => Promise<void>;
}

export default function SourceField({
	path,
	value,
	onChange,
	sourcesFor,
	ensureLoaded,
}: Props): React.ReactElement {
	const [touched, setTouched] = useState(false);
	useEffect(() => {
		if (touched) void ensureLoaded(path);
	}, [path, touched, ensureLoaded]);
	const sources = sourcesFor(path);
	const showDropdown = touched && sources.length > 0;

	return (
		<div style={S.fieldRow}>
			<span style={S.label}>Source for {path}</span>
			{showDropdown ? (
				<select
					style={S.select}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					aria-label={`Source for ${path}`}
				>
					<option value="">(any)</option>
					{sources.map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</select>
			) : (
				<input
					style={S.input}
					type="text"
					value={value}
					placeholder="any source"
					onChange={(e) => onChange(e.target.value)}
					onFocus={() => setTouched(true)}
					aria-label={`Source for ${path}`}
				/>
			)}
		</div>
	);
}
