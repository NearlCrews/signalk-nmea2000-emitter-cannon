import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Badge,
	Banner,
	Button,
	CollapsibleSection,
	formatCount,
	PanelShell,
	revealElement,
	Section,
	Stack,
	StatusIndicator,
	Text,
	usePanelAnnouncer,
	useUnsavedChangesGuard,
} from "signalk-nearlcrews-ui";
import { SaveActionBar, Tab, TabList, TabPanel, Tabs } from "signalk-nearlcrews-ui/composites";
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
import CatalogSection from "./components/CatalogSection";
import ConversionRow from "./components/ConversionRow";
import FirstRunWizard from "./components/FirstRunWizard";
import GlobalSettings from "./components/GlobalSettings";
import PanelToolbar from "./components/PanelToolbar";
import PresetChips from "./components/PresetChips";
import StatusView from "./components/StatusView";
import { configIssueControl, configIssueRow } from "./configIssueTarget";
import { CONVERSION_STYLES as C } from "./conversionStyles";
import { shouldShowFirstRunCallout } from "./firstRunState";
import { useConfig } from "./hooks/useConfig";
import { useMeta } from "./hooks/useMeta";
import { usePaths } from "./hooks/usePaths";
import { useSources } from "./hooks/useSources";
import { useStatus } from "./hooks/useStatus";
import { conversionRowId, conversionRowToggleId } from "./rowIds";

interface Props {
	configuration: unknown;
	/** Fire-and-forget; returns void. Do not await or report persistence success. */
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
		<ul style={C.bulletList}>
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

const reloadPage = (): void => window.location.reload();

/** @public Module Federation entry point consumed by the Signal K admin UI. */
export default function PluginConfigurationPanel(props: Props): React.ReactElement {
	const rootRef = useRef<HTMLDivElement>(null);
	// The shell runs the browser preflight, paints the root, wraps the body in
	// an error boundary whose "Try again" remounts the panel in place, and
	// renders the theme selector at the foot of the panel, below the body.
	return (
		<PanelShell ref={rootRef} themeToggle="end" onReload={reloadPage}>
			<PanelBody {...props} rootRef={rootRef} />
		</PanelShell>
	);
}

function PanelBody({
	configuration,
	save,
	rootRef,
}: Props & { rootRef: React.RefObject<HTMLDivElement | null> }): React.ReactElement {
	const { status, error, lastUpdatedMs, lastAttemptMs } = useStatus();
	const { state, requestedState, dispatch, markSaveRequested, unconfigured } =
		useConfig(configuration);
	const { sourcesFor, sourceErrorFor, ensureLoaded } = useSources();
	const { meta, metaError, metaLoading, reload: reloadMeta } = useMeta();
	const {
		paths: availablePaths,
		loading: pathsLoading,
		refreshing: pathsRefreshing,
		error: pathsError,
		reload: reloadPaths,
	} = usePaths();
	// The shell's own announcer, so state changes are spoken through the two
	// regions it mounted with the panel rather than through regions of ours.
	const announce = usePanelAnnouncer();
	// The toolbar search box: the panel's first control, and so the focus
	// destination for a banner whose action takes the banner, and the button
	// the user pressed, out of the tree.
	const searchRef = useRef<HTMLInputElement>(null);
	const [tab, setTab] = useState<ConversionCategory>("navigation");
	const [view, setView] = useState<PanelView>("configure");
	const [saveRequestedAt, setSaveRequestedAt] = useState<number | null>(null);
	const [wizardOpen, setWizardOpen] = useState(false);
	const [search, setSearch] = useState("");
	// Collapsible state, persisted across tab switches within the session. An
	// absent key falls back to a default (sections to their `defaultExpanded`,
	// the rest to collapsed). Sections are keyed `category:group`.
	const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
	const [expandedKey, setExpandedKey] = useState<string | null>(null);

	const clearSearch = useCallback(() => setSearch(""), []);
	// Stable identity so the wizard does not re-render on every 3 second status
	// poll while it is open. The Dialog owns Escape and focus return, so this is
	// about render cost, not about a listener detaching.
	const closeWizard = useCallback(() => setWizardOpen(false), []);

	// Bring the panel top back into view on every switch (see the hidden view
	// containers below for why both views stay mounted).
	const changeView = useCallback(
		(v: PanelView): void => {
			setView(v);
			rootRef.current?.scrollIntoView({ block: "start" });
		},
		[rootRef],
	);

	const setSectionOpen = useCallback((key: string, open: boolean): void => {
		setOpenSections((prev) => ({ ...prev, [key]: open }));
	}, []);
	// Stable identity so the memoized ConversionRow does not re-render every
	// row when one row toggles. setExpandedKey is a functional update, so no
	// dependencies are needed.
	const toggleExpand = useCallback((key: string): void => {
		setExpandedKey((prev) => (prev === key ? null : key));
	}, []);

	// Reducer cases always return a new object on change, so identity equality
	// against the last-requested snapshot is a sound dirty check. Replaces a deep
	// JSON.stringify compare that ran on every render.
	const dirty = state !== requestedState;
	// The advisor block is replaced wholesale by the setAdvisor reducer case, so
	// identity inequality against the baseline is a sound "advisor edited" check.
	const advisorSettingsDirty = state.advisor !== requestedState.advisor;

	// Warn before a tab close or reload while edits are unsaved.
	useUnsavedChangesGuard(dirty);

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

	// Reveal a conversion's editor: switch to its tab, open its section, and
	// expand its row. Clears any active search so the row is reachable in its
	// tab. The caller scrolls and focuses after React commits.
	const revealConversion = useCallback(
		(m: ConversionMetadata): void => {
			clearSearch();
			// setView directly, not changeView: changeView scrolls the panel top
			// into view, but the callers scroll to the revealed row below.
			setView("configure");
			setTab(m.category);
			const group = m.legacy ? "legacy" : "modern";
			setOpenSections((prev) => ({ ...prev, [`${m.category}:${group}`]: true }));
			setExpandedKey(m.key);
		},
		[clearSearch],
	);

	const jumpToConfigIssue = useCallback(
		(issue: ConfigIssue): void => {
			const m = metaByKey.get(issue.conversionKey);
			if (!m) return;
			revealConversion(m);
			// Scroll after React commits the tab/section/row state above. A double
			// rAF lets the newly mounted row body land in the DOM first.
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					const conversionRow = document.getElementById(conversionRowId(m.key));
					const mappingRow = conversionRow ? configIssueRow(conversionRow, issue) : undefined;
					const target =
						(conversionRow ? configIssueControl(conversionRow, issue) : undefined) ??
						mappingRow?.querySelector<HTMLElement>("button") ??
						document.getElementById(conversionRowToggleId(m.key));
					const reveal = mappingRow ?? conversionRow;
					// The scroll above places the row clear of the sticky toolbar, so
					// focus must not scroll again and undo that placement.
					if (reveal) revealElement(reveal, { block: "center" });
					target?.focus({ preventScroll: true });
				});
			});
		},
		[metaByKey, revealConversion],
	);

	// Save is only reachable while the config validates: a non-blank
	// invalidMessage disables the bar's Save button. The "Review first error"
	// action on the error banner is what carries the user to the first problem.
	// The host save callback returns void, so the request timestamp is the only
	// completion cue the panel can truthfully give. The bar owns how long that
	// message stays up, measured from the timestamp.
	const handleSave = (): void => {
		save(state);
		markSaveRequested();
		setSaveRequestedAt(Date.now());
	};

	// Parent catalog keys currently reporting an error, with sub-conversion
	// `[N]` suffixes folded onto the parent so a flaky sub-conversion surfaces
	// on its parent row and category. The same pass counts the parent rows
	// reporting an error of their own, which is what the toolbar badge shows,
	// so the poll walks the list once for both.
	const { errorKeys, parentErrorCount } = useMemo(() => {
		const keys = new Set<string>();
		let parentErrors = 0;
		if (status) {
			for (const c of status.perConversion) {
				if (!c.lastErrorMessage) continue;
				keys.add(stripSubIndex(c.key));
				if (c.parentKey === undefined) parentErrors++;
			}
		}
		return { errorKeys: keys, parentErrorCount: parentErrors };
	}, [status]);
	const errorCountByCategory = useMemo(() => {
		const c: Record<string, number> = {};
		for (const m of meta) {
			if (errorKeys.has(m.key)) c[m.category] = (c[m.category] ?? 0) + 1;
		}
		return c;
	}, [meta, errorKeys]);

	// Jump from the status error badge to the first conversion reporting an
	// error: reveal its row, then scroll it into view and focus its toggle.
	const jumpToFirstError = useCallback(() => {
		if (!status) return;
		const first = status.perConversion.find((c) => c.lastErrorMessage);
		if (!first) return;
		const m = metaByKey.get(stripSubIndex(first.key));
		if (!m) return;
		revealConversion(m);
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const row = document.getElementById(conversionRowId(m.key));
				if (row) revealElement(row, { block: "center" });
				document.getElementById(conversionRowToggleId(m.key))?.focus({ preventScroll: true });
			});
		});
	}, [status, metaByKey, revealConversion]);

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
			pathsRefreshing={pathsRefreshing}
			pathsError={pathsError}
			reloadPaths={reloadPaths}
		/>
	);

	// One category split into a Modern section (expanded by default) and a
	// Legacy section (collapsed).
	const renderCategory = (category: ConversionCategory): React.ReactElement => {
		const inCategory = meta.filter((m) => m.category === category);
		const sections = [
			{
				group: "modern" as const,
				title: "Modern",
				defaultExpanded: true,
				list: inCategory.filter((m) => !m.legacy),
			},
			{
				group: "legacy" as const,
				title: "Legacy",
				defaultExpanded: false,
				list: inCategory.filter((m) => m.legacy),
			},
		];
		return (
			<Stack gap={3}>
				{inCategory.length === 0 && !metaLoading ? (
					<Text as="p" tone="muted">
						No conversions in this category.
					</Text>
				) : null}
				{sections.map((s) => {
					if (s.list.length === 0) return null;
					const sectionKey = `${category}:${s.group}`;
					const tally = sectionCounts(s.list, state.conversions, errorKeys);
					return (
						<CatalogSection
							key={s.group}
							title={s.title}
							count={s.list.length}
							enabledCount={tally.enabled}
							errorCount={tally.errors}
							expanded={openSections[sectionKey] ?? s.defaultExpanded}
							onOpenChange={(open) => setSectionOpen(sectionKey, open)}
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
						</CatalogSection>
					);
				})}
			</Stack>
		);
	};

	const showFirstRunCallout = shouldShowFirstRunCallout(meta, state.conversions);
	const invalidMessage =
		validationErrors.length > 0
			? `Fix ${formatCount(validationErrors.length, "configuration error")} before saving.`
			: null;

	// The shell mounts one polite and one assertive region before any message
	// exists, which is the property a region mounted beside its first message
	// does not have, so the panel speaks through those rather than adding a
	// pair of its own. The banners below stay as persistent, readable feedback.
	const panelAlert = metaError
		? `Conversion catalog failed to load: ${metaError}.`
		: validationErrors.length > 0
			? `${formatCount(validationErrors.length, "configuration error")} must be fixed before saving.`
			: "";
	const panelStatus = error
		? `Status unavailable: ${error}.`
		: metaLoading && meta.length === 0 && !metaError
			? "Loading conversions..."
			: "";
	useEffect(() => {
		if (panelAlert !== "") announce(panelAlert, { assertive: true });
	}, [announce, panelAlert]);
	useEffect(() => {
		if (panelStatus !== "") announce(panelStatus);
	}, [announce, panelStatus]);

	return (
		<>
			{/* The toolbar holds the search, status chip, Configure/Status toggle,
			    and wizard shortcut. It sits above both view containers so it is
			    always visible regardless of which view is active. */}
			<PanelToolbar
				status={status}
				lastUpdatedMs={lastUpdatedMs ?? undefined}
				lastAttemptMs={lastAttemptMs ?? undefined}
				errorCount={parentErrorCount}
				onErrorBadgeClick={jumpToFirstError}
				search={search}
				onSearch={setSearch}
				onClearSearch={clearSearch}
				searchRef={searchRef}
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
				<Stack gap={4}>
					{validationErrors.length > 0 ? (
						<Banner
							actions={
								<Button
									onClick={() => validationErrors[0] && jumpToConfigIssue(validationErrors[0])}
								>
									Review first error
								</Button>
							}
							title={`${formatCount(validationErrors.length, "configuration error")} must be fixed`}
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
							title={`${formatCount(validationWarnings.length, "configuration warning")}`}
							tone="warning"
						>
							Warnings do not block Save. They identify disabled draft errors or linked NMEA 2000
							instances that should be verified.
							<ConfigIssueList issues={validationWarnings} metaByKey={metaByKey} />
						</Banner>
					) : null}
					{error ? (
						<Banner title="Status unavailable" tone="danger">
							{error}. The next poll will retry automatically.
						</Banner>
					) : null}
					{metaError ? (
						// A successful retry clears the error and takes this banner, and
						// the Retry the user pressed, with it. Focus goes to the search
						// box rather than to the document body, so the panel it just
						// loaded is reachable from its first control.
						<Banner
							actions={<Button onClick={reloadMeta}>Retry</Button>}
							dismissFocusRef={searchRef}
							title="Conversion catalog failed to load"
							tone="danger"
						>
							{metaError}.
						</Banner>
					) : null}
					{metaLoading && meta.length === 0 && !metaError ? (
						<StatusIndicator>Loading conversions...</StatusIndicator>
					) : null}
					{showFirstRunCallout ? (
						<Banner
							actions={<Button onClick={() => setWizardOpen(true)}>Open setup wizard</Button>}
							title="Nothing is emitting yet"
							tone="info"
						>
							Apply a preset below, open the setup wizard, or let the Config Advisor scan your
							boat's live data.
						</Banner>
					) : null}
					<CollapsibleSection
						title="Quick presets"
						mountStrategy="unmount"
						open={openSections["panel:presets"] ?? false}
						onOpenChange={(open) => setSectionOpen("panel:presets", open)}
					>
						<PresetChips
							onApply={(p) => dispatch({ type: "applyPreset", preset: p, meta })}
							meta={meta}
						/>
					</CollapsibleSection>
					{/* AdvisorPanel and GlobalSettings each render their own collapsible
					    section, so they are placed directly here. AdvisorPanel keeps its
					    pending review state because the configure view is never
					    unmounted. */}
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

					<Section title="Conversions">
						<Stack gap={3}>
							{/* Mounted whether or not a search is running, so a screen reader
							    observes the count changing rather than the region appearing
							    with its first count. An empty one takes no space. */}
							<StatusIndicator live="polite">
								{searchResult
									? `${formatCount(searchResult.matchCount, "match", "matches")} across all categories`
									: null}
							</StatusIndicator>
							{searchResult ? (
								<>
									{searchResult.matchCount === 0 ? (
										<Text as="p" tone="muted">
											No conversions match "{search.trim()}".
										</Text>
									) : null}
									{searchResult.groups.map((g) => {
										const tally = sectionCounts(g.list, state.conversions, errorKeys);
										return (
											<CatalogSection
												key={g.cat}
												title={CategoryLabels[g.cat]}
												count={g.list.length}
												enabledCount={tally.enabled}
												errorCount={tally.errors}
												expanded={openSections[`search:${g.cat}`] ?? true}
												onOpenChange={(open) => setSectionOpen(`search:${g.cat}`, open)}
											>
												<div style={C.list}>{g.list.map(renderRow)}</div>
											</CatalogSection>
										);
									})}
								</>
							) : (
								<Tabs value={tab} onValueChange={setTab}>
									<TabList aria-label="Conversion categories">
										{Categories.map((c) => {
											const errorCount = errorCountByCategory[c] ?? 0;
											return (
												<Tab<ConversionCategory>
													key={c}
													value={c}
													badge={
														errorCount > 0 ? (
															// The badge joins the tab's accessible name, so the tone
															// label replaces the default "Error" and the count stands
															// alone: "Electrical (12) Errors 2".
															<Badge tone="danger" toneLabel="Errors">
																{errorCount}
															</Badge>
														) : undefined
													}
												>
													{CategoryLabels[c]} <Text tone="muted">({counts[c]})</Text>
												</Tab>
											);
										})}
									</TabList>
									{/* A function child builds a category only where the panel
									    renders it, so the unselected tabs cost nothing. */}
									{Categories.map((c) => (
										<TabPanel<ConversionCategory> key={c} value={c} mountStrategy="unmount">
											{() => renderCategory(c)}
										</TabPanel>
									))}
								</Tabs>
							)}
						</Stack>
					</Section>
				</Stack>
			</div>
			<SaveActionBar
				data-panel-action-bar=""
				dirty={dirty}
				unconfigured={unconfigured}
				invalidMessage={invalidMessage}
				saveRequestedAt={saveRequestedAt}
				onSave={handleSave}
				onDiscard={() => dispatch({ type: "discard", config: requestedState })}
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
		</>
	);
}
