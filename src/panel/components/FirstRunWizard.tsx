import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversionMetadata, PathsResponse } from "../../api/types.js";
import { CategoryLabels, groupByCategory, type PresetTag } from "../../config/enums.js";
import type { Config } from "../../config/schema.js";
import { recommend } from "../../recommendation/recommender.js";
import type { PathInventory } from "../../recommendation/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson, isAbortError } from "../api-base";
import { plural } from "../recency";
import { S } from "../styles";
import { WIZARD_STYLES as W } from "../wizardStyles";
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

// Shared next-steps sentence for the footer hint in all its states.
const REVIEW_THEN_SAVE = "Close, review the checked conversions, then Save.";

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
	// Footer hint, updated after an Apply or a preset-chip apply so the
	// role="status" region reflects what just happened.
	const [hint, setHint] = useState<string | null>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const titleId = "skn-wizard-title";

	useEffect(() => {
		let cancelled = false;
		const controller = new AbortController();
		fetchJson<PathsResponse>("/paths", { signal: controller.signal })
			.then((d) => {
				if (cancelled) return;
				setPaths(d.paths);
				setLoadError(null);
			})
			.catch((e) => {
				if (!cancelled && !isAbortError(e)) setLoadError(errMessage(e));
			});
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, []);

	// Close on Escape from anywhere, and trap Tab inside the dialog: a modal
	// that lets Tab walk out into the (visually dimmed) page behind it strands
	// keyboard users. Minimal trap: wrap at the dialog edges.
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				onClose();
				return;
			}
			if (e.key !== "Tab") return;
			const dialog = dialogRef.current;
			if (!dialog) return;
			const focusables = dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
			);
			if (focusables.length === 0) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (first === undefined || last === undefined) return;
			const active = document.activeElement;
			const inside = active instanceof Node && dialog.contains(active);
			if (e.shiftKey) {
				if (!inside || active === first) {
					e.preventDefault();
					last.focus();
				}
			} else if (!inside || active === last) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	// Move focus into the dialog on mount, then return it to the control that
	// opened the wizard when the modal closes.
	useEffect(() => {
		const active = document.activeElement;
		returnFocusRef.current = active instanceof HTMLElement ? active : null;
		dialogRef.current?.focus();
		return () => {
			const target = returnFocusRef.current;
			if (target?.isConnected) target.focus();
		};
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
		const enableKeys = new Set(recs.filter((r) => r.action === "enable").map((r) => r.optionKey));
		return meta.filter((m) => enableKeys.has(m.key));
	}, [paths, meta, config.conversions]);
	const grouped = useMemo(() => groupByCategory(proposed), [proposed]);

	const checkedKeys = proposed.filter((m) => overrides[m.key] ?? true).map((m) => m.key);

	const handleApply = (): void => {
		if (checkedKeys.length > 0) onEnableKeys(checkedKeys);
		setHint(`Staged ${plural(checkedKeys.length, "conversion")}. ${REVIEW_THEN_SAVE}`);
	};

	const scanning = paths === null && loadError === null;

	return (
		<div style={W.overlay}>
			{/* Real button so click-to-close has native keyboard semantics; it sits
			    behind the dialog via zIndex. tabIndex -1 keeps the redundant close
			    out of the tab order (Escape and the header button cover keyboard). */}
			<button
				type="button"
				style={W.backdrop}
				aria-label="Close setup wizard"
				tabIndex={-1}
				onClick={onClose}
			/>
			<div
				ref={dialogRef}
				style={W.dialog}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
			>
				<div style={W.header}>
					<h2 id={titleId} style={W.title}>
						Setup wizard
					</h2>
					<button type="button" style={W.close} onClick={onClose} aria-label="Close setup wizard">
						×
					</button>
				</div>

				<div style={W.body}>
					<p style={W.intro}>
						This scans the Signal K paths your boat is publishing right now and proposes the
						not-yet-enabled conversions that have live data. Review the pre-checked list, then Apply
						to stage them. Nothing is sent to Signal K until you Save in the main panel.
					</p>

					{scanning ? <p style={S.loadingText}>Scanning live Signal K paths...</p> : null}

					{loadError ? (
						<div role="alert" style={S.errorBanner}>
							<span>
								Could not scan live paths: {loadError}. You can still apply a preset below.
							</span>
						</div>
					) : null}

					{paths !== null && grouped.length === 0 && !loadError ? (
						<p style={S.helpHint}>
							No new conversions matched live data; conversions already enabled are not listed.
							Apply a preset below, or close this wizard and enable conversions manually.
						</p>
					) : null}

					{grouped.map((g) => (
						<div key={g.cat} style={W.group}>
							<h3 style={W.groupTitle}>{CategoryLabels[g.cat]}</h3>
							{g.list.map((m) => (
								<label key={m.key} style={W.row}>
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
									<span style={W.rowText}>{m.title}</span>
								</label>
							))}
						</div>
					))}

					<h3 style={W.subhead}>Or apply a preset now</h3>
					<p style={S.helpHint}>
						Preset chips stage their conversions the moment you tap one; there is no separate Apply
						step.
					</p>
					{/* Preset chips show their own "Enabled N conversions, not yet
					    sent to Signal K." confirmation, so a chip tap does not also rewrite the
					    footer hint. */}
					<PresetChips onApply={onApplyPreset} meta={meta} />
				</div>

				<div style={W.footer}>
					<span style={W.footerHint} role="status">
						{hint ??
							`Apply stages your selection; preset chips stage instantly. ${REVIEW_THEN_SAVE}`}
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
