import type * as React from "react";
import { useState } from "react";
import { Badge, Button, CollapsibleSection, LiveRegion } from "signalk-nearlcrews-ui";
import { plural } from "../recency";

interface Props {
	title: string;
	count: number;
	enabledCount: number;
	expanded: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
	// Number of conversions in this section reporting an error, shown next to
	// the enabled count. Optional: omitted or 0 renders nothing.
	errorCount?: number;
	// Bulk-toggle handlers. When both are provided, Enable all and Disable all
	// buttons appear in the section header beside the toggle.
	onEnableAll?: () => void;
	onDisableAll?: () => void;
}

/**
 * A collapsible section grouping conversion rows (Modern or Legacy, or one
 * category of search results). The rows unmount while the section is closed:
 * a closed section holds no editor state worth keeping, and unmounting keeps
 * the effects of dozens of rows from re-running on every reopen. The heading
 * sits at level 3 under the Conversions section.
 */
export default function CatalogSection({
	title,
	count,
	enabledCount,
	expanded,
	onOpenChange,
	children,
	errorCount,
	onEnableAll,
	onDisableAll,
}: Props): React.ReactElement {
	// The press counter keys the announcement, so pressing the same bulk action
	// twice is spoken twice even though the words did not change.
	const [announce, setAnnounce] = useState<{ text: string; presses: number }>({
		text: "",
		presses: 0,
	});
	const say = (text: string): void => setAnnounce((prev) => ({ text, presses: prev.presses + 1 }));
	const actions =
		onEnableAll && onDisableAll ? (
			<>
				<Button
					size="compact"
					onClick={() => {
						onEnableAll();
						say(`Enabled ${plural(count, "conversion")} in ${title}.`);
					}}
				>
					Enable all
				</Button>
				<Button
					size="compact"
					onClick={() => {
						onDisableAll();
						say(`Disabled ${plural(count, "conversion")} in ${title}.`);
					}}
				>
					Disable all
				</Button>
				<LiveRegion announceKey={announce.presses} message={announce.text} />
			</>
		) : undefined;
	return (
		<CollapsibleSection
			title={title}
			headingLevel={3}
			mountStrategy="unmount"
			open={expanded}
			onOpenChange={onOpenChange}
			actions={actions}
			summaryPlacement="header"
			summaryVisibility="always"
			summary={
				<>
					{plural(count, "conversion")}
					{enabledCount > 0 ? `, ${enabledCount} enabled` : ""}
					{errorCount && errorCount > 0 ? (
						<>
							{" "}
							<Badge tone="danger" toneLabel="Errors">
								{errorCount}
							</Badge>
						</>
					) : null}
				</>
			}
		>
			{children}
		</CollapsibleSection>
	);
}
