import type * as React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import {
	Banner,
	Button,
	formatCount,
	LiveRegion,
	Section,
	Stack,
	StatusIndicator,
	Text,
} from "signalk-nearlcrews-ui";
import { CheckboxGroup } from "signalk-nearlcrews-ui/composites";
import { Dialog } from "signalk-nearlcrews-ui/overlays";
import type { ConversionMetadata, PathsResponse } from "../../api/types.js";
import { CategoryLabels, groupByCategory, type PresetTag } from "../../config/enums.js";
import type { Config } from "../../config/schema.js";
import { recommend } from "../../recommendation/recommender.js";
import type { PathInventory } from "../../recommendation/types.js";
import { errMessage } from "../../utils/errorUtils.js";
import { fetchJson, isAbortError } from "../api-base";
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
 *
 * The shared Dialog owns the scrim, the focus trap, focus return, the Escape
 * key, and the scrim press, so this component keeps only the wizard's own
 * scan, proposal, and staging behavior.
 */
export default function FirstRunWizard({
	meta,
	config,
	onEnableKeys,
	onApplyPreset,
	onClose,
}: Props): React.ReactElement {
	const applyHintId = useId();
	const [paths, setPaths] = useState<string[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	// Unchecked-by-the-user overrides; every proposed conversion is checked
	// unless overridden, so no state sync with the proposal list is needed.
	const [overrides, setOverrides] = useState<Record<string, boolean>>({});
	// Footer hint, updated after an Apply or a preset-chip apply so the
	// status region reflects what just happened.
	const [hint, setHint] = useState<string | null>(null);

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

	const isChecked = (key: string): boolean => overrides[key] ?? true;
	const checkedKeys = proposed.filter((m) => isChecked(m.key)).map((m) => m.key);

	const handleApply = (): void => {
		if (checkedKeys.length > 0) onEnableKeys(checkedKeys);
		setHint(`Staged ${formatCount(checkedKeys.length, "conversion")}. ${REVIEW_THEN_SAVE}`);
	};

	const scanning = paths === null && loadError === null;
	// The scan is the wizard's opening act and it finishes without any control
	// changing, so the chip that reports it has to be there before the result
	// is. It stays mounted and its text changes; a failed scan says nothing
	// here, because the assertive region below interrupts with that instead.
	const scanStatus = scanning
		? "Scanning live Signal K paths..."
		: loadError !== null
			? ""
			: `${formatCount(proposed.length, "conversion")} proposed from the live path scan.`;
	// Why Apply is blocked, stated where the button can point at it. A natively
	// disabled button is skipped by keyboard, so the reason would otherwise be
	// unreachable from the control it explains.
	const applyBlockedReason =
		checkedKeys.length > 0
			? null
			: proposed.length === 0
				? "No conversions were proposed, so there is nothing to apply."
				: "Check at least one conversion to apply it.";

	return (
		<Dialog
			open
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			title="Setup wizard"
			width="wide"
			description="This scans the Signal K paths your boat is publishing right now and proposes the not-yet-enabled conversions that have live data. Review the pre-checked list, then Apply to stage them. Nothing is sent to Signal K until you Save in the main panel."
			actions={
				<>
					<Button
						variant="primary"
						onClick={handleApply}
						ariaDisabled={applyBlockedReason !== null}
						aria-describedby={applyBlockedReason === null ? undefined : applyHintId}
					>
						Apply{checkedKeys.length > 0 ? ` (${checkedKeys.length})` : ""}
					</Button>
					<Button onClick={onClose}>Close</Button>
				</>
			}
		>
			<Stack gap={4}>
				<StatusIndicator live="polite">{scanStatus}</StatusIndicator>

				{/* Mounted before any message so a screen reader observes the text
				    change rather than the region appearing with it. */}
				<LiveRegion
					live="assertive"
					message={loadError ? `Live path scan failed: ${loadError}.` : ""}
				/>
				{loadError ? (
					<Banner title="Live path scan failed" tone="danger">
						{loadError}. You can still apply a preset below.
					</Banner>
				) : null}

				{paths !== null && grouped.length === 0 && !loadError ? (
					<Text as="p" tone="muted" size="sm">
						No new conversions matched live data; conversions already enabled are not listed. Apply
						a preset below, or close this wizard and enable conversions manually.
					</Text>
				) : null}

				{grouped.map((g) => (
					<CheckboxGroup
						key={g.cat}
						legend={CategoryLabels[g.cat]}
						layout="stack"
						options={g.list.map((m) => ({ value: m.key, label: m.title }))}
						value={g.list.filter((m) => isChecked(m.key)).map((m) => m.key)}
						onValueChange={(values) => {
							const selected = new Set(values);
							setOverrides((current) => {
								const next = { ...current };
								for (const m of g.list) next[m.key] = selected.has(m.key);
								return next;
							});
						}}
					/>
				))}

				<Section
					title="Or apply a preset now"
					headingLevel={3}
					landmark={false}
					description="Preset chips stage their conversions the moment you tap one; there is no separate Apply step."
				>
					{/* Preset chips show their own "Enabled N conversions, not yet
					    sent to Signal K." confirmation, so a chip tap does not also
					    rewrite the status hint below. */}
					<PresetChips onApply={onApplyPreset} meta={meta} />
				</Section>

				{applyBlockedReason === null ? null : (
					<Text as="p" id={applyHintId} tone="muted" size="sm">
						{applyBlockedReason}
					</Text>
				)}
				<StatusIndicator live="polite">
					{hint ?? `Apply stages your selection; preset chips stage instantly. ${REVIEW_THEN_SAVE}`}
				</StatusIndicator>
			</Stack>
		</Dialog>
	);
}
