import type * as React from "react";
import type { ExtrasMeta } from "../../api/types.js";

interface Props {
	meta: ExtrasMeta;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function ExtrasEditor({
	meta,
}: Props): React.ReactElement | null {
	if (meta.type === "none") return null;
	return (
		<div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
			[{meta.type} editor coming in Milestone 6]
		</div>
	);
}
