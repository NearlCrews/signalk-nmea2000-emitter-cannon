import type * as React from "react";
import { plural } from "../recency";
import { S } from "../styles";

/**
 * Error-count badge rendered as a button that jumps to the first conversion
 * reporting an error. Shared by StatusDashboard and StatusView so the two
 * badges stay pixel-identical and carry the same accessible name.
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
		<button
			type="button"
			style={S.errorBadgeButton}
			onClick={onClick}
			aria-label={`${label}. Jump to first error.`}
		>
			{label}
		</button>
	);
}
