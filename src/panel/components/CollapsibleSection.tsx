import type * as React from "react";
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
}

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
					{count} {count === 1 ? "conversion" : "conversions"}
					{enabledCount > 0 ? ` · ${enabledCount} enabled` : ""}
				</span>
			</button>
			{expanded ? (
				<div id={bodyId} style={S.sectionBody}>
					{children}
				</div>
			) : null}
		</div>
	);
}
