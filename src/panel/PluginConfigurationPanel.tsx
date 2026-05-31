import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConversionMetadata, PerConversionStatus } from "../api/types.js";
import { Categories, type ConversionCategory } from "../config/enums";
import AdvisorPanel from "./components/advisor/AdvisorPanel";
import CategoryTabs from "./components/CategoryTabs";
import CollapsibleSection from "./components/CollapsibleSection";
import ConversionCard from "./components/ConversionCard";
import FooterBar from "./components/FooterBar";
import GlobalSettings from "./components/GlobalSettings";
import PresetChips from "./components/PresetChips";
import StatusDashboard from "./components/StatusDashboard";
import { useConfig } from "./hooks/useConfig";
import { useMeta } from "./hooks/useMeta";
import { useSources } from "./hooks/useSources";
import { useStatus } from "./hooks/useStatus";
import { S, THEME_STYLE } from "./styles";

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
	const { meta, metaError, metaLoading, reload: reloadMeta } = useMeta();
	const [tab, setTab] = useState<ConversionCategory>("navigation");
	const [justSavedAt, setJustSavedAt] = useState<number | null>(null);
	// Disclosure state, persisted across tab switches within the session. An
	// absent key falls back to a default (sections to their `defaultExpanded`,
	// cards to collapsed). Sections are keyed `category:group`.
	const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
	const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>(
		{},
	);

	const toggleSection = (key: string): void => {
		setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
	};
	// Stable identity so the memoized ConversionCard does not re-render every
	// card when one card toggles. setExpandedCards is a functional update, so no
	// dependencies are needed.
	const toggleCard = useCallback((key: string): void => {
		setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }));
	}, []);

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

	// The active category split into a Modern section (expanded by default)
	// and a Legacy section (collapsed).
	const sections = useMemo(() => {
		const inTab = meta.filter((m) => m.category === tab);
		return [
			{
				group: "modern" as const,
				title: "Modern",
				defaultExpanded: true,
				list: inTab.filter((m) => !m.legacy),
			},
			{
				group: "legacy" as const,
				title: "Legacy",
				defaultExpanded: false,
				list: inTab.filter((m) => m.legacy),
			},
		];
	}, [meta, tab]);
	const hasConversions = sections.some((s) => s.list.length > 0);

	const renderCard = (m: ConversionMetadata): React.ReactElement => (
		<ConversionCard
			key={m.key}
			meta={m}
			config={state.conversions[m.key]}
			status={statusByKey.get(m.key)}
			expanded={expandedCards[m.key] ?? false}
			dispatch={dispatch}
			toggleCard={toggleCard}
			sourcesFor={sourcesFor}
			ensureLoaded={ensureLoaded}
		/>
	);

	return (
		<div className="skn-panel" style={S.root}>
			<style>{THEME_STYLE}</style>
			<StatusDashboard status={status} />
			<AdvisorPanel
				advisor={state.advisor}
				onChangeAdvisor={(advisor) => dispatch({ type: "setAdvisor", advisor })}
			/>
			{error ? (
				<div role="alert" style={S.errorBanner}>
					<span>Status: {error}. The next poll will retry automatically.</span>
				</div>
			) : null}
			{metaError ? (
				<div role="alert" style={S.errorBanner}>
					<span>Conversion catalog failed to load: {metaError}.</span>
					<button type="button" style={S.btnRetry} onClick={reloadMeta}>
						Retry
					</button>
				</div>
			) : null}
			{metaLoading && meta.length === 0 && !metaError ? (
				<p role="status" style={S.loadingText}>
					Loading conversions...
				</p>
			) : null}
			<PresetChips
				onApply={(p) => dispatch({ type: "applyPreset", preset: p, meta })}
			/>
			<GlobalSettings
				value={state.globalResendInterval}
				onChange={(ms) => dispatch({ type: "setGlobalResend", ms })}
			/>
			<CategoryTabs active={tab} onChange={setTab} countsByCategory={counts} />
			<div
				role="tabpanel"
				id={`skn-panel-${tab}`}
				aria-labelledby={`skn-tab-${tab}`}
			>
				{!hasConversions && !metaLoading ? (
					<p style={S.loadingText}>No conversions in this category.</p>
				) : null}
				{sections.map((s) => {
					if (s.list.length === 0) return null;
					const sectionKey = `${tab}:${s.group}`;
					return (
						<CollapsibleSection
							key={s.group}
							id={`skn-section-${tab}-${s.group}`}
							title={s.title}
							count={s.list.length}
							enabledCount={s.list.reduce(
								(n, m) => n + (state.conversions[m.key]?.enabled ? 1 : 0),
								0,
							)}
							expanded={openSections[sectionKey] ?? s.defaultExpanded}
							onToggle={() => toggleSection(sectionKey)}
						>
							{s.list.map(renderCard)}
						</CollapsibleSection>
					);
				})}
			</div>
			<FooterBar
				dirty={dirty}
				justSavedAt={justSavedAt}
				onSave={handleSave}
				onDiscard={() => dispatch({ type: "discard", config: savedState })}
			/>
		</div>
	);
}
