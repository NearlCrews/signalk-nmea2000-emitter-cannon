import type * as React from "react";
import type { CSSProperties } from "react";
import { plural } from "../recency";
import { S } from "../styles";
import DisclosureCaret from "./DisclosureCaret";

interface Props {
	id: string;
	title: string;
	count: number;
	enabledCount: number;
	expanded: boolean;
	onToggle: () => void;
	children: React.ReactNode;
	// Number of conversions in this section reporting an error, shown next to
	// the enabled count. Optional: omitted or 0 renders nothing.
	errorCount?: number;
}

// Error count rendered in the section header. Danger-colored so it reads as a
// problem, sitting alongside the muted count text.
const SECTION_ERROR_COUNT: CSSProperties = {
	fontWeight: 600,
	fontSize: "var(--skn-font-small)",
	color: "var(--skn-danger-fg)",
	marginLeft: 6,
};

/**
 * A disclosure section grouping conversion cards (Modern or Legacy). The
 * header is a button; the body of cards renders only while expanded.
 */
export default function CollapsibleSection({
	id,
	title,
	count,
	enabledCount,
	expanded,
	onToggle,
	children,
	errorCount,
}: Props): React.ReactElement {
	const bodyId = `${id}-body`;
	return (
		<div style={S.section}>
			<button
				type="button"
				style={S.sectionHeader}
				aria-expanded={expanded}
				aria-controls={bodyId}
				onClick={onToggle}
			>
				<DisclosureCaret expanded={expanded} />
				{title}
				<span style={S.sectionCount}>
					{plural(count, "conversion")}
					{enabledCount > 0 ? ` · ${enabledCount} enabled` : ""}
				</span>
				{errorCount && errorCount > 0 ? (
					<span style={SECTION_ERROR_COUNT}>{plural(errorCount, "error")}</span>
				) : null}
			</button>
			{expanded ? (
				<div id={bodyId} style={S.sectionBody}>
					{children}
				</div>
			) : (
				// Placeholder keeps the header's aria-controls target present
				// while the section is collapsed and its cards are unmounted.
				<div id={bodyId} hidden />
			)}
		</div>
	);
}
