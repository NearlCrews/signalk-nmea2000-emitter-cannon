import type * as React from "react";
import StatusDashboard from "./components/StatusDashboard";
import { useStatus } from "./hooks/useStatus";
import { S } from "./styles";

interface Props {
	configuration: unknown;
	save: (configuration: unknown) => void;
}

export default function PluginConfigurationPanel(
	_props: Props,
): React.ReactElement {
	const { status, error } = useStatus();
	return (
		<div style={S.root}>
			<StatusDashboard status={status} />
			{error ? (
				<p style={{ color: "crimson", fontSize: 12 }}>Status error: {error}</p>
			) : null}
			<p>Conversion cards coming next.</p>
		</div>
	);
}
