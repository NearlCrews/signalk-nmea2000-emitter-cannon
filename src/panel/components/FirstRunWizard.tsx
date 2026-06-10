import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { recommend } from "../../advisor/recommender.js";
import type { PathInventory } from "../../advisor/types.js";
import type { ConversionMetadata, PathsResponse } from "../../api/types.js";
import {
	CategoryLabels,
	groupByCategory,
	type PresetTag,
} from "../../config/enums.js";
import type { Config } from "../../config/schema.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson } from "../api-base";
import { plural } from "../recency";
import { S } from "../styles";
import PresetChips from "./PresetChips";

interface Props {
	// Conversion catalog from /api/conversions.
	meta: ConversionMetadata[];
	// Current config; conversions already enabled are not proposed.
	config: Config;
	// Stage the given conversion keys as enabled through the reducer. Marks the
	// panel dirty; the user reviews and Saves afterward.
	onEnableKeys: (keys: string[]) => void;
	// Apply a preset (same path the PresetChips use).
	onApplyPreset: (preset: PresetTag) => void;
	onClose: () => void;
}

/**
 * Guided first-run setup. Fetches the observed Signal K paths and runs them
 * through the advisor's pure recommender, proposing the not-yet-enabled
 * conversions whose declared paths have live data, grouped by category and
 * pre-checked. One Apply button stages the checked enables through the
 * reducer; the user then reviews and Saves. Preset shortcuts cover the rest.
 * The dialog closes on the X button, the Escape key, or a click on the
 * backdrop.
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
	// Unchecked-by-the-user overrides; every proposed conversion is checked
	// unless overridden, so no state sync with the proposal list is needed.
	const [overrides, setOverrides] = useState<Record<string, boolean>>({});
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

	// The advisor's deterministic recommender over the live path scan. The
	// wizard has no per-path source data, so liveSources stays empty and the
	// echo-guard ("already on the bus") branch never suppresses a proposal.
	// Only "enable" recommendations are proposed, which also excludes
	// conversions that are already enabled.
	const proposed = useMemo(() => {
		if (!paths) return [];
		const inventory: PathInventory = paths.map((path) => ({
			path,
			live: true,
			liveSources: [],
		}));
		const recs = recommend({
			inventory,
			metadata: meta,
			currentConfig: config.conversions,
		});
		const enableKeys = new Set(
			recs.filter((r) => r.action === "enable").map((r) => r.optionKey),
		);
		return meta.filter((m) => enableKeys.has(m.key));
	}, [paths, meta, config.conversions]);
	const grouped = useMemo(() => groupByCategory(proposed), [proposed]);

	const checkedKeys = proposed
		.filter((m) => overrides[m.key] ?? true)
		.map((m) => m.key);

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
						proposes the not-yet-enabled conversions that have live data. Review
						the pre-checked list, then Apply to stage them. Nothing is saved
						until you Save in the main panel.
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
							No new conversions matched live data; conversions already enabled
							are not listed. Apply a preset below, or close this wizard and
							enable conversions manually.
						</p>
					) : null}

					{grouped.map((g) => (
						<div key={g.cat} style={S.wizardGroup}>
							<h3 style={S.wizardGroupTitle}>{CategoryLabels[g.cat]}</h3>
							{g.list.map((m) => (
								<label key={m.key} style={S.wizardRow}>
									<input
										type="checkbox"
										style={S.checkbox}
										checked={overrides[m.key] ?? true}
										onChange={(e) =>
											setOverrides((c) => ({
												...c,
												[m.key]: e.target.checked,
											}))
										}
									/>
									<span style={S.wizardRowText}>{m.title}</span>
								</label>
							))}
						</div>
					))}

					<h3 style={S.wizardSubhead}>Or apply a preset</h3>
					<PresetChips onApply={onApplyPreset} meta={meta} />
				</div>

				<div style={S.wizardFooter}>
					<span style={S.wizardFooterHint} role="status">
						{stagedCount === null
							? "Applying stages your selection. Close, review the checked conversions, then Save."
							: `Staged ${plural(stagedCount, "conversion")}. Close, review the checked conversions, then Save.`}
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
