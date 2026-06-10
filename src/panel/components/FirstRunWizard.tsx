import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversionMetadata, PathsResponse } from "../../api/types.js";
import {
	Categories,
	CategoryLabels,
	type PresetTag,
} from "../../config/enums.js";
import type { Config } from "../../config/schema.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson } from "../api-base";
import { S } from "../styles";
import PresetChips from "./PresetChips";

interface Props {
	// Conversion catalog from /api/conversions.
	meta: ConversionMetadata[];
	// Current config, used to flag conversions already enabled.
	config: Config;
	// Stage the given conversion keys as enabled through the reducer. Marks the
	// panel dirty; the user reviews and Saves afterward.
	onEnableKeys: (keys: string[]) => void;
	// Apply a preset (same path the PresetChips use).
	onApplyPreset: (preset: PresetTag) => void;
	onClose: () => void;
}

/**
 * A conversion "has live data" when at least one of its declared Signal K paths
 * is currently published: either the path itself is in the observed set, or an
 * observed path sits beneath it (e.g. the conversion declares
 * `electrical.batteries` and the bus publishes `electrical.batteries.0.voltage`).
 */
function hasLiveData(m: ConversionMetadata, observed: Set<string>): boolean {
	return m.paths.some((cp) => {
		if (observed.has(cp)) return true;
		const prefix = `${cp}.`;
		for (const o of observed) if (o.startsWith(prefix)) return true;
		return false;
	});
}

/**
 * Guided first-run setup. Fetches the observed Signal K paths, matches them
 * against each conversion's declared paths, and proposes the conversions that
 * have live data, grouped by category and pre-checked. One Apply button stages
 * the checked enables through the reducer; the user then reviews and Saves.
 * Preset shortcuts cover the rest. The dialog closes on the X button, the
 * Escape key, or a click on the backdrop.
 */
export default function FirstRunWizard({
	meta,
	config,
	onEnableKeys,
	onApplyPreset,
	onClose,
}: Props): React.ReactElement {
	const [paths, setPaths] = useState<string[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [checked, setChecked] = useState<Record<string, boolean>>({});
	const [stagedCount, setStagedCount] = useState<number | null>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const titleId = "skn-wizard-title";

	useEffect(() => {
		let cancelled = false;
		fetchJson<PathsResponse>("/paths")
			.then((d) => {
				if (cancelled) return;
				setPaths(d.paths);
				setLoadError(null);
			})
			.catch((e) => {
				if (!cancelled) setLoadError(errMessage(e));
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Close on Escape from anywhere in the dialog.
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	// Move focus into the dialog on mount so keyboard and screen-reader users
	// land inside the modal rather than behind it.
	useEffect(() => {
		dialogRef.current?.focus();
	}, []);

	const observed = useMemo(() => new Set(paths ?? []), [paths]);
	const proposed = useMemo(
		() => (paths ? meta.filter((m) => hasLiveData(m, observed)) : []),
		[meta, paths, observed],
	);
	const grouped = useMemo(
		() =>
			Categories.map((cat) => ({
				cat,
				list: proposed.filter((m) => m.category === cat),
			})).filter((g) => g.list.length > 0),
		[proposed],
	);

	// Pre-check every proposed conversion once the path scan resolves.
	useEffect(() => {
		const init: Record<string, boolean> = {};
		for (const m of proposed) init[m.key] = true;
		setChecked(init);
	}, [proposed]);

	const checkedKeys = proposed.filter((m) => checked[m.key]).map((m) => m.key);

	const handleApply = (): void => {
		if (checkedKeys.length > 0) onEnableKeys(checkedKeys);
		setStagedCount(checkedKeys.length);
	};

	const scanning = paths === null && loadError === null;

	return (
		<div style={S.wizardOverlay}>
			{/* Real button so click-to-close has native keyboard semantics; it sits
			    behind the dialog via zIndex. tabIndex -1 keeps the redundant close
			    out of the tab order (Escape and the header button cover keyboard). */}
			<button
				type="button"
				style={S.wizardBackdrop}
				aria-label="Close setup wizard"
				tabIndex={-1}
				onClick={onClose}
			/>
			<div
				ref={dialogRef}
				style={S.wizardDialog}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
			>
				<div style={S.wizardHeader}>
					<h2 id={titleId} style={S.wizardTitle}>
						Setup wizard
					</h2>
					<button
						type="button"
						style={S.wizardClose}
						onClick={onClose}
						aria-label="Close setup wizard"
					>
						×
					</button>
				</div>

				<div style={S.wizardBody}>
					<p style={S.wizardIntro}>
						This scans the Signal K paths your boat is publishing right now and
						proposes the conversions that have live data. Review the pre-checked
						list, then Apply to stage them. Nothing is saved until you Save in
						the main panel.
					</p>

					{scanning ? (
						<p style={S.loadingText}>Scanning live Signal K paths...</p>
					) : null}

					{loadError ? (
						<div role="alert" style={S.errorBanner}>
							<span>
								Could not scan live paths: {loadError}. You can still apply a
								preset below.
							</span>
						</div>
					) : null}

					{paths !== null && grouped.length === 0 && !loadError ? (
						<p style={S.helpHint}>
							No conversions matched live data yet. Apply a preset below, or
							close this wizard and enable conversions manually.
						</p>
					) : null}

					{grouped.map((g) => (
						<div key={g.cat} style={S.wizardGroup}>
							<h3 style={S.wizardGroupTitle}>{CategoryLabels[g.cat]}</h3>
							{g.list.map((m) => {
								const already = config.conversions[m.key]?.enabled ?? false;
								return (
									<label key={m.key} style={S.wizardRow}>
										<input
											type="checkbox"
											style={S.checkbox}
											checked={checked[m.key] ?? false}
											onChange={(e) =>
												setChecked((c) => ({
													...c,
													[m.key]: e.target.checked,
												}))
											}
										/>
										<span style={S.wizardRowText}>{m.title}</span>
										{already ? (
											<span style={S.wizardRowMeta}>already enabled</span>
										) : null}
									</label>
								);
							})}
						</div>
					))}

					<h3 style={S.wizardSubhead}>Or apply a preset</h3>
					<PresetChips onApply={onApplyPreset} meta={meta} />
				</div>

				<div style={S.wizardFooter}>
					<span style={S.wizardFooterHint} role="status">
						{stagedCount === null
							? "Applying stages your selection. Close, review the checked conversions, then Save."
							: `Staged ${stagedCount} conversion${
									stagedCount === 1 ? "" : "s"
								}. Close, review the checked conversions, then Save.`}
					</span>
					<button
						type="button"
						style={S.btnPrimary}
						onClick={handleApply}
						disabled={checkedKeys.length === 0}
					>
						Apply {checkedKeys.length > 0 ? `(${checkedKeys.length})` : ""}
					</button>
					<button type="button" style={S.btnSecondary} onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
