import type * as React from "react";
import { useEffect, useState } from "react";
import type { ConversionsResponse } from "../api/types.js";

interface Props {
	configuration: unknown;
	save: (configuration: unknown) => void;
}

export default function PluginConfigurationPanel(
	_props: Props,
): React.ReactElement {
	const [count, setCount] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/plugins/signalk-nmea2000-emitter-cannon/api/conversions")
			.then((r) => r.json() as Promise<ConversionsResponse>)
			.then((d) => setCount(d.conversions.length))
			.catch((e) => setError(String(e)));
	}, []);

	return (
		<div
			style={{
				padding: 16,
				fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
			}}
		>
			<h2>NMEA2000 Emitter Cannon</h2>
			{error ? <p style={{ color: "crimson" }}>Error: {error}</p> : null}
			{count !== null ? <p>Loaded {count} conversions.</p> : <p>Loading...</p>}
		</div>
	);
}
