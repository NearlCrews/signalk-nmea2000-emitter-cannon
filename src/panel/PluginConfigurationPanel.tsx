import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, PanelRoot, supportsNativeCssScope } from "signalk-nearlcrews-ui";
import type { ConversionMetadata, PerConversionStatus } from "../api/types.js";
import {
	Categories,
	CategoryLabels,
	type ConversionCategory,
	groupByCategory,
} from "../config/enums";
import { type ConfigIssue, validateConfig } from "../config/validation.js";
import { stripSubIndex } from "../utils/pathUtils.js";
import AdvisorPanel from "./components/advisor/AdvisorPanel";
import CategoryTabs from "./components/CategoryTabs";
import CollapsibleSection from "./components/CollapsibleSection";
import ConversionRow from "./components/ConversionRow";
import Disclosure from "./components/Disclosure";
import FirstRunWizard from "./components/FirstRunWizard";
import FooterBar from "./components/FooterBar";
import GlobalSettings from "./components/GlobalSettings";
import PanelToolbar from "./components/PanelToolbar";
import PresetChips from "./components/PresetChips";
import StatusView from "./components/StatusView";
import { configIssueControls, configIssueRow } from "./configIssueTarget";
import { CONVERSION_STYLES as C } from "./conversionStyles";
import { shouldShowFirstRunCallout } from "./firstRunState";
import { useConfig } from "./hooks/useConfig";
import { useMeta } from "./hooks/useMeta";
import { usePaths } from "./hooks/usePaths";
import { useSources } from "./hooks/useSources";
import { useStatus } from "./hooks/useStatus";
import { plural } from "./recency";
import { S } from "./styles";
import { THEME_STYLE } from "./theme";

interface Props {
	configuration: unknown;
	/** Fire-and-forget; returns void. Do not await. The next `configuration` prop reflects the saved state. */
	save: (configuration: unknown) => void;
}

const NO_CONFIG_ISSUES: ConfigIssue[] = [];

function ConfigIssueList({
	issues,
	metaByKey,
}: {
	issues: ConfigIssue[];
	metaByKey: Map<string, ConversionMetadata>;
}): React.ReactElement {
	return (
		<ul>
			{issues.slice(0, 5).map((issue) => (
				<li
					key={`${issue.conversionKey}:${issue.collection ?? "fixed"}:${issue.field}:${issue.rowIndex ?? "all"}:${issue.message}`}
				>
					{metaByKey.get(issue.conversionKey)?.title ?? issue.conversionKey}
					{issue.rowIndex === undefined ? "" : `, row ${issue.rowIndex + 1}`}: {issue.message}
				</li>
			))}
		</ul>
	);
}

type PanelView = "configure" | "status";

const VIEW_CHOICES: ReadonlyArray<{ value: PanelView; label: string }> = [
	{ value: "configure", label: "Configure" },
	{ value: "status", label: "Status" },
];

// Per-section enabled and error tallies. The search branch and the tab branch
// both render category/group sections, so the two counts are derived the same
// way in one place rather than as four inline reducers recomputed every render.
function sectionCounts(
	list: ConversionMetadata[],
	conversions: Record<string, { enabled: boolean } | undefined>,
	errorKeys: ReadonlySet<string>,
): { enabled: number; errors: number } {
	let enabled = 0;
	let errors = 0;
	for (const m of list) {
		if (conversions[m.key]?.enabled) enabled++;
		if (errorKeys.has(m.key)) errors++;
	}
	return { enabled, errors };
}

// A conversion matches the catalog search when the needle (already lower-cased)
// appears in its title, one of its PGN numbers, or one of its Signal K paths.
function matchesQuery(m: ConversionMetadata, needle: string): boolean {
	if (m.title.toLowerCase().includes(needle)) return true;
	for (const p of m.pgns) if (p.includes(needle)) return true;
	for (const p of m.paths) if (p.toLowerCase().includes(needle)) return true;
	return false;
}

/** @public Module Federation entry point consumed by the Signal K admin UI. */
export default function PluginConfigurationPanel(props: Props): React.ReactElement {
	if (typeof window === "undefined" || !supportsNativeCssScope(window)) {
		return (
			<div data-browser-compatibility-message="" role="alert">
				<h2>Browser update required</h2>
				<p>
					This panel requires native CSS @scope. Update the browser or embedded WebView before
					reopening Signal K Admin.
				</p>
			</div>
		);
	}

	return <SupportedPluginConfigurationPanel {...props} />;
}

function SupportedPluginConfigurationPanel({ configuration, save }: Props): React.ReactElement {
	const { status, error, lastUpdatedMs, lastAttemptMs } = useStatus();
	const { state, savedState, dispatch, markSaved } = useConfig(configuration);
	const { sourcesFor, sourceErrorFor, ensureLoaded } = useSources();
	const { meta, metaError, metaLoading, reload: reloadMeta } = useMeta();
	const {
		paths: availablePaths,
		loading: pathsLoading,
		error: pathsError,
		reload: reloadPaths,
	} = usePaths();
	const [tab, setTab] = useState<ConversionCategory>("navigation");
	const [view, setView] = useState<PanelView>("configure");
	const rootRef = useRef<HTMLDivElement>(null);
	const [justSavedAt, setJustSavedAt] = useState<number | null>(null);
	const [wizardOpen, setWizardOpen] = useState(false);
	const [search, setSearch] = useState("");
	// Disclosure state, persisted across tab switches within the session. An
	// absent key falls back to a default (sections to their `defaultExpanded`,
	// rows to collapsed). Sections are keyed `category:group`.
	const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
	const [expandedKey, setExpandedKey] = useState<string | null>(null);

	const clearSearch = useCallback(() => setSearch(""), []);
	// Stable identity so the wizard's document keydown listener (keyed on
	// onClose) does not detach and reattach on every 3 second status poll
	// re-render while the wizard is open.
	const closeWizard = useCallback(() => setWizardOpen(false), []);

	// Bring the panel top back into view on every switch (see the hidden view
	// containers below for why both views stay mounted).
	const changeView = useCallback((v: PanelView): void => {
		setView(v);
		rootRef.current?.scrollIntoView({ block: "start" });
	}, []);

	const toggleSection = (key: string): void => {
		setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
	};
	// Stable identity so the memoized ConversionRow does not re-render every
	// row when one row toggles. setExpandedKey is a functional update, so no
	// dependencies are needed.
	const toggleExpand = useCallback((key: string): void => {
		setExpandedKey((prev) => (prev === key ? null : key));
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
	// True when the host has not yet handed the panel a saved configuration.
	// The `configuration` prop is null or undefined on a fresh install, before
	// the user has ever saved. In this state Save must be enabled at all times
	// so the user can commit defaults and allow the plugin to start.
	const unconfigured = configuration == null;
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

	const setEnabledForKeys = useCallback(
		(keys: string[], enabled: boolean): void => {
			for (const k of keys) dispatch({ type: "setEnabled", key: k, enabled });
		},
		[dispatch],
	);
	const enableKeys = useCallback(
		(keys: string[]) => setEnabledForKeys(keys, true),
		[setEnabledForKeys],
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
	const childStatusesByParent = useMemo(() => {
		const grouped = new Map<string, PerConversionStatus[]>();
		if (status) {
			for (const row of status.perConversion) {
				if (row.parentKey === undefined) continue;
				const children = grouped.get(row.parentKey) ?? [];
				children.push(row);
				grouped.set(row.parentKey, children);
			}
		}
		for (const children of grouped.values()) {
			children.sort((a, b) => (a.mappingIndex ?? 0) - (b.mappingIndex ?? 0));
		}
		return grouped;
	}, [status]);
	const metaByKey = useMemo(() => {
		const m = new Map<string, ConversionMetadata>();
		for (const x of meta) m.set(x.key, x);
		return m;
	}, [meta]);
	const configIssues = useMemo(() => validateConfig(state), [state]);
	const validationErrors = useMemo(
		() => configIssues.filter((issue) => issue.severity === "error"),
		[configIssues],
	);
	const validationWarnings = useMemo(
		() => configIssues.filter((issue) => issue.severity === "warning"),
		[configIssues],
	);
	const configIssuesByKey = useMemo(() => {
		const grouped = new Map<string, ConfigIssue[]>();
		for (const issue of configIssues) {
			const issues = grouped.get(issue.conversionKey) ?? [];
			issues.push(issue);
			grouped.set(issue.conversionKey, issues);
		}
		return grouped;
	}, [configIssues]);

	const jumpToConfigIssue = useCallback(
		(issue: ConfigIssue): void => {
			const m = metaByKey.get(issue.conversionKey);
			if (!m) return;
			clearSearch();
			setView("configure");
			setTab(m.category);
			const group = m.legacy ? "legacy" : "modern";
			setOpenSections((prev) => ({ ...prev, [`${m.category}:${group}`]: true }));
			setExpandedKey(m.key);
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					const conversionRow = document.getElementById(`skn-row-${m.key}`);
					const mappingRow = conversionRow ? configIssueRow(conversionRow, issue) : undefined;
					const target =
						(conversionRow ? configIssueControls(conversionRow, issue)[0] : undefined) ??
						mappingRow?.querySelector<HTMLElement>("button") ??
						document.getElementById(`skn-row-toggle-${m.key}`);
					(mappingRow ?? conversionRow)?.scrollIntoView({ behavior: "smooth", block: "center" });
					target?.focus();
				});
			});
		},
		[metaByKey, clearSearch],
	);

	const handleSave = (): void => {
		const firstError = validationErrors[0];
		if (firstError) {
			jumpToConfigIssue(firstError);
			return;
		}
		save(state);
		markSaved();
		setJustSavedAt(Date.now());
	};

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
		// setView directly, not changeView: changeView scrolls the panel top
		// into view, but here we want to scroll to the error card below.
		setView("configure");
		setTab(m.category);
		const group = m.legacy ? "legacy" : "modern";
		setOpenSections((prev) => ({ ...prev, [`${m.category}:${group}`]: true }));
		setExpandedKey(m.key);
		// Scroll after React commits the tab/section/row state above. A double
		// rAF lets the newly mounted row body land in the DOM first.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				document
					.getElementById(`skn-row-${m.key}`)
					?.scrollIntoView({ behavior: "smooth", block: "center" });
				document.getElementById(`skn-row-toggle-${m.key}`)?.focus();
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

	const renderRow = (m: ConversionMetadata): React.ReactElement => (
		<ConversionRow
			key={m.key}
			meta={m}
			config={state.conversions[m.key]}
			status={statusByKey.get(m.key)}
			childStatuses={childStatusesByParent.get(m.key) ?? []}
			validationIssues={configIssuesByKey.get(m.key) ?? NO_CONFIG_ISSUES}
			expanded={expandedKey === m.key}
			dispatch={dispatch}
			setExpanded={toggleExpand}
			sourcesFor={sourcesFor}
			sourceErrorFor={sourceErrorFor}
			ensureLoaded={ensureLoaded}
			globalResendSeconds={state.globalResendInterval}
			availablePaths={availablePaths}
			pathsLoading={pathsLoading}
			pathsError={pathsError}
			reloadPaths={reloadPaths}
		/>
	);

	const showFirstRunCallout = shouldShowFirstRunCallout(meta, state.conversions);

	return (
		<PanelRoot
			className="skn-panel"
			legacyThemeStorageKeys={["skn-theme"]}
			style={S.root}
			width="full"
			ref={rootRef}
		>
			<style>{THEME_STYLE}</style>
			{/* The toolbar holds the search, status chip, Configure/Status toggle,
			    theme toggle, and wizard shortcut. It sits above both view containers
			    so it is always visible regardless of which view is active. */}
			<PanelToolbar
				status={status}
				lastUpdatedMs={lastUpdatedMs ?? undefined}
				lastAttemptMs={lastAttemptMs ?? undefined}
				onErrorBadgeClick={jumpToFirstError}
				search={search}
				onSearch={setSearch}
				onClearSearch={clearSearch}
				view={view}
				onChangeView={changeView}
				onOpenWizard={() => setWizardOpen(true)}
				viewChoices={VIEW_CHOICES}
			/>

			{/* Both views stay mounted; the inactive one is hidden. Unmounting on
			    every switch dropped AdvisorPanel state and refetched its pending
			    list each time the user peeked at Status. Because both stay
			    mounted, a deep scroll offset in one view would persist into the
			    other, so changeView scrolls the panel top back into view. */}
			<div hidden={view !== "status"}>
				<StatusView status={status} metaByKey={metaByKey} onErrorClick={jumpToFirstError} />
			</div>
			<div hidden={view !== "configure"}>
				{validationErrors.length > 0 ? (
					<Banner
						actions={
							<Button onClick={() => validationErrors[0] && jumpToConfigIssue(validationErrors[0])}>
								Review first error
							</Button>
						}
						live="assertive"
						title={`${plural(validationErrors.length, "configuration error")} must be fixed`}
						tone="danger"
					>
						<ConfigIssueList issues={validationErrors} metaByKey={metaByKey} />
					</Banner>
				) : validationWarnings.length > 0 ? (
					<Banner
						actions={
							<Button
								onClick={() => validationWarnings[0] && jumpToConfigIssue(validationWarnings[0])}
							>
								Review first warning
							</Button>
						}
						title={`${plural(validationWarnings.length, "configuration warning")}`}
						tone="warning"
					>
						Warnings do not block Save. They identify disabled draft errors or linked NMEA 2000
						instances that should be verified.
						<ConfigIssueList issues={validationWarnings} metaByKey={metaByKey} />
					</Banner>
				) : null}
				{error ? (
					<Banner live="polite" title="Status unavailable" tone="danger">
						{error}. The next poll will retry automatically.
					</Banner>
				) : null}
				{metaError ? (
					<Banner
						actions={<Button onClick={reloadMeta}>Retry</Button>}
						live="assertive"
						title="Conversion catalog failed to load"
						tone="danger"
					>
						{metaError}.
					</Banner>
				) : null}
				{metaLoading && meta.length === 0 && !metaError ? (
					<p role="status" style={S.loadingText}>
						Loading conversions...
					</p>
				) : null}
				{showFirstRunCallout ? (
					<Banner
						actions={<Button onClick={() => setWizardOpen(true)}>Open setup wizard</Button>}
						title="Nothing is emitting yet"
						tone="info"
					>
						Apply a preset below, open the setup wizard, or let the Config Advisor scan your boat's
						live data.
					</Banner>
				) : null}
				<Disclosure
					id="skn-panel-presets"
					label="Quick presets"
					lazy
					open={openSections["panel:presets"] ?? false}
					onToggle={() => toggleSection("panel:presets")}
				>
					<PresetChips
						onApply={(p) => dispatch({ type: "applyPreset", preset: p, meta })}
						meta={meta}
					/>
				</Disclosure>
				{/* AdvisorPanel and GlobalSettings each render their own collapsible
				    section titled the same as a wrapper would be, so they are placed
				    directly here without an extra disclosure that would duplicate the
				    title. AdvisorPanel keeps its pending review state because the
				    configure view is never unmounted. */}
				<AdvisorPanel
					advisor={state.advisor}
					onChangeAdvisor={(advisor) => dispatch({ type: "setAdvisor", advisor })}
					dirty={dirty}
					advisorSettingsDirty={advisorSettingsDirty}
					metaByKey={metaByKey}
				/>
				<GlobalSettings
					value={state.globalResendInterval}
					onChange={(ms) => dispatch({ type: "setGlobalResend", ms })}
				/>

				{searchResult ? (
					<div>
						<p style={S.searchSummary} role="status">
							{plural(searchResult.matchCount, "match")} across all categories
						</p>
						{searchResult.matchCount === 0 ? (
							<p style={S.loadingText}>No conversions match "{search.trim()}".</p>
						) : null}
						{searchResult.groups.map((g) => {
							const counts = sectionCounts(g.list, state.conversions, errorKeys);
							return (
								<CollapsibleSection
									key={g.cat}
									id={`skn-search-${g.cat}`}
									title={CategoryLabels[g.cat]}
									count={g.list.length}
									enabledCount={counts.enabled}
									errorCount={counts.errors}
									expanded={openSections[`search:${g.cat}`] ?? true}
									onToggle={() => toggleSection(`search:${g.cat}`)}
								>
									<div style={C.list}>{g.list.map(renderRow)}</div>
								</CollapsibleSection>
							);
						})}
					</div>
				) : (
					<>
						<CategoryTabs
							active={tab}
							onChange={setTab}
							countsByCategory={counts}
							errorCountByCategory={errorCountByCategory}
						/>
						<div role="tabpanel" id={`skn-panel-${tab}`} aria-labelledby={`skn-tab-${tab}`}>
							{!hasConversions && !metaLoading ? (
								<p style={S.loadingText}>No conversions in this category.</p>
							) : null}
							{sections.map((s) => {
								if (s.list.length === 0) return null;
								const sectionKey = `${tab}:${s.group}`;
								const counts = sectionCounts(s.list, state.conversions, errorKeys);
								return (
									<CollapsibleSection
										key={s.group}
										id={`skn-section-${tab}-${s.group}`}
										title={s.title}
										count={s.list.length}
										enabledCount={counts.enabled}
										errorCount={counts.errors}
										expanded={openSections[sectionKey] ?? s.defaultExpanded}
										onToggle={() => toggleSection(sectionKey)}
										onEnableAll={() =>
											setEnabledForKeys(
												s.list.map((m) => m.key),
												true,
											)
										}
										onDisableAll={() =>
											setEnabledForKeys(
												s.list.map((m) => m.key),
												false,
											)
										}
									>
										<div style={C.list}>{s.list.map(renderRow)}</div>
									</CollapsibleSection>
								);
							})}
						</div>
					</>
				)}
			</div>
			<FooterBar
				dirty={dirty}
				unconfigured={unconfigured}
				validationErrorCount={validationErrors.length}
				justSavedAt={justSavedAt}
				onSave={handleSave}
				onDiscard={() => dispatch({ type: "discard", config: savedState })}
			/>
			{wizardOpen ? (
				<FirstRunWizard
					meta={meta}
					config={state}
					onEnableKeys={enableKeys}
					onApplyPreset={(p) => dispatch({ type: "applyPreset", preset: p, meta })}
					onClose={closeWizard}
				/>
			) : null}
		</PanelRoot>
	);
}
