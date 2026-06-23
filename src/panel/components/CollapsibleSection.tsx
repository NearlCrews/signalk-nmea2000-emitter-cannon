import type * as React from "react";
import { useState } from "react";
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
	// Bulk-toggle handlers. When both are provided, Enable all and Disable all
	// buttons appear in the section header alongside the toggle.
	onEnableAll?: () => void;
	onDisableAll?: () => void;
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
	onEnableAll,
	onDisableAll,
}: Props): React.ReactElement {
	const [announce, setAnnounce] = useState("");
	const trailing =
		onEnableAll && onDisableAll ? (
			<>
				<button
					type="button"
					style={S.bulkBtn}
					onClick={() => {
						onEnableAll();
						setAnnounce(`Enabled ${count} conversions in ${title}.`);
					}}
				>
					Enable all
				</button>
				<button
					type="button"
					style={S.bulkBtn}
					onClick={() => {
						onDisableAll();
						setAnnounce(`Disabled ${count} conversions in ${title}.`);
					}}
				>
					Disable all
				</button>
				<span role="status" style={S.visuallyHidden}>
					{announce}
				</span>
			</>
		) : undefined;
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
				headerTrailing={trailing}
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
