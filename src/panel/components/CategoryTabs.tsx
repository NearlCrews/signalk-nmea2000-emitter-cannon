import type * as React from "react";
import type { CSSProperties } from "react";
import { useRef } from "react";
import {
	Categories,
	CategoryLabels,
	type ConversionCategory,
} from "../../config/enums";
import { plural } from "../recency";
import { S } from "../styles";

// Small danger-colored count badge on a tab whose category has conversions
// reporting errors. Inline-block so it sits after the tab's count.
const TAB_ERROR_DOT: CSSProperties = {
	display: "inline-block",
	minWidth: 16,
	marginLeft: 6,
	padding: "0 5px",
	borderRadius: "var(--skn-radius-pill)",
	background: "var(--skn-danger-fg)",
	color: "var(--skn-surface)",
	fontSize: "var(--skn-font-small)",
	fontWeight: 700,
	lineHeight: "16px",
	textAlign: "center",
};

interface Props {
	active: ConversionCategory;
	onChange: (next: ConversionCategory) => void;
	countsByCategory: Record<ConversionCategory, number>;
	// Per-category count of conversions currently reporting an error. Optional:
	// a missing or 0 entry renders no error badge on that tab.
	errorCountByCategory?: Record<string, number>;
}

export default function CategoryTabs({
	active,
	onChange,
	countsByCategory,
	errorCountByCategory,
}: Props): React.ReactElement {
	const refs = useRef<(HTMLButtonElement | null)[]>([]);

	// Arrow-key roving focus, the WAI-ARIA tablist pattern. Left/Right move
	// between tabs and activate; Home/End jump to the ends.
	const onKeyDown = (e: React.KeyboardEvent, index: number): void => {
		let next = index;
		if (e.key === "ArrowRight") next = (index + 1) % Categories.length;
		else if (e.key === "ArrowLeft")
			next = (index - 1 + Categories.length) % Categories.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = Categories.length - 1;
		else return;
		e.preventDefault();
		onChange(Categories[next]);
		refs.current[next]?.focus();
	};

	return (
		<div style={S.tabs} role="tablist" aria-label="Conversion categories">
			{Categories.map((c, i) => {
				const isActive = active === c;
				const errorCount = errorCountByCategory?.[c] ?? 0;
				return (
					<button
						key={c}
						ref={(el) => {
							refs.current[i] = el;
						}}
						style={{ ...S.tab, ...(isActive ? S.tabActive : {}) }}
						onClick={() => onChange(c)}
						onKeyDown={(e) => onKeyDown(e, i)}
						type="button"
						role="tab"
						id={`skn-tab-${c}`}
						aria-controls={`skn-panel-${c}`}
						aria-selected={isActive}
						tabIndex={isActive ? 0 : -1}
					>
						{CategoryLabels[c]}{" "}
						<span style={S.tabCount}>({countsByCategory[c] ?? 0})</span>
						{errorCount > 0 ? (
							<span
								role="img"
								style={TAB_ERROR_DOT}
								aria-label={`${plural(errorCount, "error")} in ${CategoryLabels[c]}`}
							>
								{errorCount}
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
