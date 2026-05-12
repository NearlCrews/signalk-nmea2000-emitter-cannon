import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type {
	ConversionMetadata,
	ConversionsResponse,
	PerConversionStatus,
} from "../api/types.js";
import { Categories } from "../config/enums";
import type { ConversionCategory } from "../config/enums.js";
import CategoryTabs from "./components/CategoryTabs";
import ConversionCard from "./components/ConversionCard";
import FooterBar from "./components/FooterBar";
import GlobalSettings from "./components/GlobalSettings";
import PresetChips from "./components/PresetChips";
import StatusDashboard from "./components/StatusDashboard";
import { useConfig } from "./hooks/useConfig";
import { useSources } from "./hooks/useSources";
import { useStatus } from "./hooks/useStatus";
import { S } from "./styles";

interface Props {
	configuration: unknown;
	save: (configuration: unknown) => void;
}

export default function PluginConfigurationPanel({
	configuration,
	save,
}: Props): React.ReactElement {
	const { status, error } = useStatus();
	const { state, initial, dispatch } = useConfig(configuration);
	const { sourcesFor, ensureLoaded } = useSources();
	const [meta, setMeta] = useState<ConversionMetadata[]>([]);
	const [tab, setTab] = useState<ConversionCategory>("navigation");

	useEffect(() => {
		fetch("/plugins/signalk-nmea2000-emitter-cannon/api/conversions", {
			credentials: "same-origin",
		})
			.then((r) => r.json() as Promise<ConversionsResponse>)
			.then((d) => setMeta(d.conversions))
			.catch(() => {});
	}, []);

	const dirty = useMemo(
		() => JSON.stringify(state) !== JSON.stringify(initial),
		[state, initial],
	);

	const visible = meta.filter((m) => m.category === tab);
	const counts = useMemo(() => {
		const c = {} as Record<ConversionCategory, number>;
		for (const cat of Categories) c[cat] = 0;
		for (const m of meta) c[m.category]++;
		return c;
	}, [meta]);
	const statusByKey = useMemo(() => {
		const m = new Map<string, PerConversionStatus>();
		if (status) for (const r of status.perConversion) m.set(r.key, r);
		return m;
	}, [status]);

	return (
		<div style={S.root}>
			<StatusDashboard status={status} />
			{error ? (
				<p style={{ color: "crimson", fontSize: 12 }}>Status error: {error}</p>
			) : null}
			<PresetChips
				onApply={(p) => dispatch({ type: "applyPreset", preset: p, meta })}
			/>
			<GlobalSettings
				value={state.globalResendInterval}
				onChange={(ms) => dispatch({ type: "setGlobalResend", ms })}
			/>
			<CategoryTabs active={tab} onChange={setTab} countsByCategory={counts} />
			{visible.map((m) => (
				<ConversionCard
					key={m.key}
					meta={m}
					config={state.conversions[m.key]}
					status={statusByKey.get(m.key)}
					sourcesFor={sourcesFor}
					ensureLoaded={ensureLoaded}
					onSetEnabled={(e) =>
						dispatch({ type: "setEnabled", key: m.key, enabled: e })
					}
					onSetResend={(ms) => dispatch({ type: "setResend", key: m.key, ms })}
					onSetSource={(path, source) =>
						dispatch({ type: "setSource", key: m.key, path, source })
					}
					onSetExtras={(extras) =>
						dispatch({ type: "setExtras", key: m.key, extras })
					}
				/>
			))}
			<FooterBar
				dirty={dirty}
				onSave={() => save(state)}
				onDiscard={() => dispatch({ type: "discard", config: initial })}
			/>
		</div>
	);
}
