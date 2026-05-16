import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	ConversionMetadata,
	ConversionsResponse,
	PerConversionStatus,
} from "../api/types.js";
import { Categories } from "../config/enums";
import type { ConversionCategory } from "../config/enums.js";
import { errMessage } from "../utils/errorUtils.js";
import { PLUGIN_API_BASE } from "./api-base";
import AdvisorPanel from "./components/advisor/AdvisorPanel";
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

// Inline styles cannot express :focus-visible, so a small <style> block
// gives form controls inside the federated panel a consistent focus ring
// regardless of the host admin theme.
const FOCUS_STYLE = `
.skn-panel input:focus-visible,
.skn-panel select:focus-visible,
.skn-panel button:focus-visible {
	outline: 2px solid #3b82f6;
	outline-offset: 1px;
}
`;

interface Props {
	configuration: unknown;
	/** Fire-and-forget; returns void. Do not await. The next `configuration` prop reflects the saved state. */
	save: (configuration: unknown) => void;
}

export default function PluginConfigurationPanel({
	configuration,
	save,
}: Props): React.ReactElement {
	const { status, error } = useStatus();
	const { state, savedState, dispatch, markSaved } = useConfig(configuration);
	const { sourcesFor, ensureLoaded } = useSources();
	const [meta, setMeta] = useState<ConversionMetadata[]>([]);
	const [metaError, setMetaError] = useState<string | null>(null);
	const [metaLoading, setMetaLoading] = useState(true);
	const [tab, setTab] = useState<ConversionCategory>("navigation");
	const [justSavedAt, setJustSavedAt] = useState<number | null>(null);

	const loadMeta = useCallback(() => {
		setMetaLoading(true);
		fetch(`${PLUGIN_API_BASE}/conversions`, {
			credentials: "same-origin",
		})
			.then(async (r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return (await r.json()) as ConversionsResponse;
			})
			.then((d) => {
				setMeta(d.conversions);
				setMetaError(null);
			})
			.catch((e) => {
				setMetaError(errMessage(e));
			})
			.finally(() => {
				setMetaLoading(false);
			});
	}, []);

	useEffect(() => {
		loadMeta();
	}, [loadMeta]);

	useEffect(() => {
		if (justSavedAt === null) return;
		const t = setTimeout(() => setJustSavedAt(null), 2500);
		return () => clearTimeout(t);
	}, [justSavedAt]);

	// Reducer cases always return a new object on change, so identity equality
	// against the last-saved snapshot is a sound dirty check. Replaces a deep
	// JSON.stringify compare that ran on every render.
	const dirty = state !== savedState;

	const handleSave = (): void => {
		save(state);
		markSaved();
		setJustSavedAt(Date.now());
	};

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
		<div className="skn-panel" style={S.root}>
			<style>{FOCUS_STYLE}</style>
			<StatusDashboard status={status} />
			<AdvisorPanel
				advisor={state.advisor}
				onChangeAdvisor={(advisor) => dispatch({ type: "setAdvisor", advisor })}
				dirty={dirty}
				onSave={handleSave}
			/>
			{error ? (
				<div role="alert" style={S.errorBanner}>
					<span>Status: {error}. The next poll will retry automatically.</span>
				</div>
			) : null}
			{metaError ? (
				<div role="alert" style={S.errorBanner}>
					<span>Conversion catalog failed to load: {metaError}.</span>
					<button type="button" style={S.btnRetry} onClick={loadMeta}>
						Retry
					</button>
				</div>
			) : null}
			{metaLoading && meta.length === 0 && !metaError ? (
				<p style={{ color: "#666", fontSize: 13 }}>Loading conversions…</p>
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
				justSavedAt={justSavedAt}
				onSave={handleSave}
				onDiscard={() => dispatch({ type: "discard", config: savedState })}
			/>
		</div>
	);
}
