import type * as React from "react";
import { Button } from "signalk-nearlcrews-ui";
import { plural } from "../recency";

/**
 * Error-count badge rendered as a button that jumps to the first conversion
 * reporting an error. Carries a consistent accessible name and style wherever
 * it appears in the panel.
 */
export default function ErrorBadgeButton({
	count,
	onClick,
}: {
	count: number;
	onClick: () => void;
}): React.ReactElement {
	const label = plural(count, "error");
	return (
		<Button
			size="compact"
			variant="danger"
			onClick={onClick}
			aria-label={`${label}. Jump to first error.`}
		>
			{label}
		</Button>
	);
}
