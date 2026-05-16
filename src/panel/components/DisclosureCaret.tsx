import type * as React from "react";
import { S } from "../styles";

/** The triangle marker for a disclosure control: pointing down when expanded. */
export default function DisclosureCaret({
	expanded,
}: {
	expanded: boolean;
}): React.ReactElement {
	return (
		<span style={S.disclosureCaret} aria-hidden="true">
			{expanded ? "▾" : "▸"}
		</span>
	);
}
