import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversionMetadata, PerConversionStatus } from "../api/types.js";
import {
	Categories,
	CategoryLabels,
	type ConversionCategory,
	groupByCategory,
} from "../config/enums";
import { stripSubIndex } from "../utils/pathUtils.js";
import AdvisorPanel from "./components/advisor/AdvisorPanel";
import CategoryTabs from "./components/CategoryTabs";
import CollapsibleSection from "./components/CollapsibleSection";
import ConversionCard from "./components/ConversionCard";
import FirstRunWizard from "./components/FirstRunWizard";
import FooterBar from "./components/FooterBar";
import GlobalSettings from "./components/GlobalSettings";
import PresetChips from "./components/PresetChips";
import SegmentedControl from "./components/SegmentedControl";
import StatusDashboard from "./components/StatusDashboard";
import StatusView from "./components/StatusView";
import ThemeToggle from "./components/ThemeToggle";
import { useConfig } from "./hooks/useConfig";
import { useMeta } from "./hooks/useMeta";
import { useSources } from "./hooks/useSources";
import { useStatus } from "./hooks/useStatus";
import { plural } from "./recency";
import { S, THEME_STYLE } from "./styles";

interface Props {
	configuration: unknown;
	/** Fire-and-forget; returns void. Do not await. The next `configuration` prop reflects the saved state. */
	save: (configuration: unknown) => void;
}

type PanelView = "configure" | "status";

const VIEW_CHOICES: ReadonlyArray<{ value: PanelView; label: string }> = [
	{ value: "configure", label: "Configure" },
	{ value: "status", label: "Status" },
];

// A conversion matches the catalog search when the needle (already lower-cased)
// appears in its title, one of its PGN numbers, or one of its Signal K paths.
function matchesQuery(m: ConversionMetadata, needle: string): boolean {
	if (m.title.toLowerCase().includes(needle)) return true;
	for (const p of m.pgns) if (p.includes(needle)) return true;
	for (const p of m.paths) if (p.toLowerCase().includes(needle)) return true;
	return false;
}

export default function PluginConfigurationPanel({
	configuration,
	save,
}: Props): React.ReactElement {
	const { status, error, lastUpdatedMs } = useStatus();
	const { state, savedState, dispatch, markSaved } = useConfig(configuration);
	const { sourcesFor, ensureLoaded } = useSources();
	const { meta, metaError, metaLoading, reload: reloadMeta } = useMeta();
	const [tab, setTab] = useState<ConversionCategory>("navigation");
	const [view, setView] = useState<PanelView>("configure");
	const rootRef = useRef<HTMLDivElement>(null);
	const [justSavedAt, setJustSavedAt] = useState<number | null>(null);
	const [wizardOpen, setWizardOpen] = useState(false);
	const [search, setSearch] = useState("");
	// Disclosure state, persisted across tab switches within the session. An
	// absent key falls back to a default (sections to their `defaultExpanded`,
	// cards to collapsed). Sections are keyed `category:group`.
	const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
	const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>(
		{},
	);

	const clearSearch = useCallback(() => setSearch(""), []);

	// Both views stay mounted (switching via `hidden`), so a deep scroll offset
	// in one view would otherwise persist into the other. Bring the panel top
	// back into view on every switch.
	const changeView = useCallback((v: PanelView): void => {
		setView(v);
		rootRef.current?.scrollIntoView({ block: "start" });
	}, []);

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
	// The advisor block is replaced wholesale by the setAdvisor reducer case, so
	// identity inequality against the baseline is a sound "advisor edited" check.
	const advisorSettingsDirty = state.advisor !== savedState.advisor;

	// Warn before a tab close or reload while edits are unsaved. The handler is
	// only registered while dirty and torn down once clean or unmounted.
	useEffect(() => {
		if (!dirty) return;
		const onBeforeUnload = (e: BeforeUnloadEvent): void => {
			e.preventDefault();
			// Legacy browsers require a returnValue to trigger the prompt.
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [dirty]);

	const handleSave = (): void => {
		save(state);
		markSaved();
		setJustSavedAt(Date.now());
	};

	const enableKeys = useCallback(
		(keys: string[]): void => {
			for (const k of keys)
				dispatch({ type: "setEnabled", key: k, enabled: true });
		},
		[dispatch],
	);

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
	const metaByKey = useMemo(() => {
		const m = new Map<string, ConversionMetadata>();
		for (const x of meta) m.set(x.key, x);
		return m;
	}, [meta]);

	// Parent catalog keys currently reporting an error, with sub-conversion
	// `[N]` suffixes folded onto the parent so a flaky sub-conversion surfaces
	// on its parent card and category.
	const errorKeys = useMemo(() => {
		const s = new Set<string>();
		if (status) {
			for (const c of status.perConversion) {
				if (c.lastErrorMessage) s.add(stripSubIndex(c.key));
			}
		}
		return s;
	}, [status]);
	const errorCountByCategory = useMemo(() => {
		const c: Record<string, number> = {};
		for (const m of meta) {
			if (errorKeys.has(m.key)) c[m.category] = (c[m.category] ?? 0) + 1;
		}
		return c;
	}, [meta, errorKeys]);

	// Jump from the status error badge to the first conversion reporting an
	// error: switch to its tab, expand its section and card, and scroll it into
	// view. Clears any active search so the card is reachable in its tab.
	const jumpToFirstError = useCallback(() => {
		if (!status) return;
		const first = status.perConversion.find((c) => c.lastErrorMessage);
		if (!first) return;
		const m = metaByKey.get(stripSubIndex(first.key));
		if (!m) return;
		clearSearch();
		setView("configure");
		setTab(m.category);
		const group = m.legacy ? "legacy" : "modern";
		setOpenSections((prev) => ({ ...prev, [`${m.category}:${group}`]: true }));
		setExpandedCards((prev) => ({ ...prev, [m.key]: true }));
		// Scroll after React commits the tab/section/card state above. A double
		// rAF lets the newly mounted card body land in the DOM first.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				document
					.getElementById(`skn-card-${m.key}`)
					?.scrollIntoView({ behavior: "smooth", block: "center" });
			});
		});
	}, [status, metaByKey, clearSearch]);

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

	// When searching, flatten matches across every category, grouped by category
	// for orientation. Null when the search box is empty.
	const searchResult = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return null;
		const matched = meta.filter((m) => matchesQuery(m, q));
		return { groups: groupByCategory(matched), matchCount: matched.length };
	}, [search, meta]);

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
			globalResendSeconds={state.globalResendInterval}
		/>
	);

	const showFirstRunCallout = status !== null && status.enabledCount === 0;

	return (
		<div className="skn-panel" style={S.root} ref={rootRef}>
			<style>{THEME_STYLE}</style>
			<div style={S.controlBar}>
				<SegmentedControl
					legend="View"
					choices={VIEW_CHOICES}
					value={view}
					onChange={changeView}
				/>
				<div style={S.controlBarGroup}>
					{/* Permanent wizard shortcut: the first-run callout disappears
					    once anything is enabled, so the wizard needs a home that
					    stays discoverable. */}
					<button
						type="button"
						style={S.btnSecondary}
						onClick={() => setWizardOpen(true)}
					>
						Setup wizard
					</button>
					<ThemeToggle />
				</div>
			</div>

			{/* Both views stay mounted; the inactive one is hidden. Unmounting on
			    every switch dropped AdvisorPanel state and refetched its pending
			    list each time the user peeked at Status. */}
			<div hidden={view !== "status"}>
				<StatusView
					status={status}
					metaByKey={metaByKey}
					onErrorClick={jumpToFirstError}
				/>
			</div>
			<div hidden={view !== "configure"}>
				<StatusDashboard
					status={status}
					onErrorBadgeClick={jumpToFirstError}
					lastUpdatedMs={lastUpdatedMs ?? undefined}
				/>
				<AdvisorPanel
					advisor={state.advisor}
					onChangeAdvisor={(advisor) =>
						dispatch({ type: "setAdvisor", advisor })
					}
					dirty={dirty}
					advisorSettingsDirty={advisorSettingsDirty}
					metaByKey={metaByKey}
				/>
				{error ? (
					<div role="alert" style={S.errorBanner}>
						<span>
							Status: {error}. The next poll will retry automatically.
						</span>
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
				{showFirstRunCallout ? (
					<div style={S.calloutFirstRun}>
						<span style={S.calloutText}>
							Nothing is emitting yet. Apply a preset below, open the setup
							wizard, or let the Config Advisor scan your boat's live data.
						</span>
						<button
							type="button"
							style={S.btnPrimary}
							onClick={() => setWizardOpen(true)}
						>
							Open setup wizard
						</button>
					</div>
				) : null}
				{/* One-line heading so the chips read as bulk-enable shortcuts,
				    not as filters for the catalog below. */}
				<h3 style={{ ...S.advisorSubhead, marginTop: 0 }}>
					Quick presets: enable a group at once
				</h3>
				<PresetChips
					onApply={(p) => dispatch({ type: "applyPreset", preset: p, meta })}
					meta={meta}
				/>
				<GlobalSettings
					value={state.globalResendInterval}
					onChange={(ms) => dispatch({ type: "setGlobalResend", ms })}
				/>
				<div style={S.searchRow}>
					<input
						type="search"
						style={S.searchInput}
						value={search}
						placeholder="Search conversions by name, PGN, or path"
						aria-label="Search conversions by name, PGN, or path"
						onChange={(e) => setSearch(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") clearSearch();
						}}
					/>
					{/* Always mounted (disabled while empty) so the input width does
					    not jump on the first keystroke. */}
					<button
						type="button"
						style={S.searchClear}
						onClick={clearSearch}
						disabled={!search}
					>
						Clear
					</button>
				</div>

				{searchResult ? (
					<div>
						<p style={S.searchSummary} role="status">
							{plural(searchResult.matchCount, "match")} across all categories
						</p>
						{searchResult.matchCount === 0 ? (
							<p style={S.loadingText}>
								No conversions match "{search.trim()}".
							</p>
						) : null}
						{searchResult.groups.map((g) => (
							<CollapsibleSection
								key={g.cat}
								id={`skn-search-${g.cat}`}
								title={CategoryLabels[g.cat]}
								count={g.list.length}
								enabledCount={g.list.reduce(
									(n, m) => n + (state.conversions[m.key]?.enabled ? 1 : 0),
									0,
								)}
								errorCount={g.list.reduce(
									(n, m) => n + (errorKeys.has(m.key) ? 1 : 0),
									0,
								)}
								expanded={openSections[`search:${g.cat}`] ?? true}
								onToggle={() => toggleSection(`search:${g.cat}`)}
							>
								{g.list.map(renderCard)}
							</CollapsibleSection>
						))}
					</div>
				) : (
					<>
						<CategoryTabs
							active={tab}
							onChange={setTab}
							countsByCategory={counts}
							errorCountByCategory={errorCountByCategory}
						/>
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
										errorCount={s.list.reduce(
											(n, m) => n + (errorKeys.has(m.key) ? 1 : 0),
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
					</>
				)}
			</div>
			<FooterBar
				dirty={dirty}
				justSavedAt={justSavedAt}
				onSave={handleSave}
				onDiscard={() => dispatch({ type: "discard", config: savedState })}
			/>
			{wizardOpen ? (
				<FirstRunWizard
					meta={meta}
					config={state}
					onEnableKeys={enableKeys}
					onApplyPreset={(p) =>
						dispatch({ type: "applyPreset", preset: p, meta })
					}
					onClose={() => setWizardOpen(false)}
				/>
			) : null}
		</div>
	);
}
