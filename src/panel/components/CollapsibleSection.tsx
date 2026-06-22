import type * as React from "react";
import { plural } from "../recency";
import { S } from "../styles";
import Disclosure from "./Disclosure";

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
	return (
		<div style={S.section}>
			<Disclosure
				id={`${id}-body`}
				label={title}
				headerStyle={S.sectionHeader}
				bodyStyle={S.sectionBody}
				lazy
				open={expanded}
				onToggle={onToggle}
				summary={
					<>
						{plural(count, "conversion")}
						{enabledCount > 0 ? ` · ${enabledCount} enabled` : ""}
						{errorCount && errorCount > 0 ? (
							<span style={S.sectionErrorCount}>
								{plural(errorCount, "error")}
							</span>
						) : null}
					</>
				}
			>
				{children}
			</Disclosure>
		</div>
	);
}
