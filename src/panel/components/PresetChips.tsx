import type * as React from "react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ConversionMetadata } from "../../api/types.js";
import { type PresetTag, PresetTags } from "../../config/enums";
import { plural } from "../recency";
import { S } from "../styles";

const LABELS: Record<PresetTag, string> = {
	"basic-nav": "Basic navigation",
	"engine-set": "Engine set",
	"full-ais": "Full AIS",
	environmental: "Environmental",
	raymarine: "Raymarine",
};

// How long the visible "Enabled N conversions" confirmation stays up.
const ANNOUNCE_VISIBLE_MS = 4000;

// Visible confirmation under the chips. Success-colored so it reads as a
// result, small so it does not push the catalog around when it appears.
const ANNOUNCE_TEXT: CSSProperties = {
	fontSize: "var(--skn-font-small)",
	fontWeight: 600,
	color: "var(--skn-success-fg)",
	margin: "-8px 0 8px",
};

// Zero-width space. Appended/removed on each apply so re-applying the same
// preset still changes the live-region text, which forces a re-announce.
const ZWSP = "​";

interface Props {
	onApply: (preset: PresetTag) => void;
	// Conversion catalog, used to count how many conversions each preset
	// enables (those whose `presets` include the tag).
	meta: ConversionMetadata[];
}

export default function PresetChips({
	onApply,
	meta,
}: Props): React.ReactElement {
	// Count of conversions each preset enables. Recomputed only when the
	// catalog changes. Mirrors the applyPreset reducer, which enables every
	// conversion whose `presets` include the tag.
	const countByPreset = useMemo(() => {
		const counts = {} as Record<PresetTag, number>;
		for (const p of PresetTags) counts[p] = 0;
		for (const m of meta) {
			for (const p of m.presets) counts[p]++;
		}
		return counts;
	}, [meta]);

	// Message shown (and announced) after a chip is applied. The seq counter
	// drives the zero-width-space toggle so a repeated apply still re-announces.
	const [announce, setAnnounce] = useState<{ text: string; seq: number }>({
		text: "",
		seq: 0,
	});

	// The visible confirmation clears after a few seconds. Keyed on the whole
	// announce object so a re-apply restarts the timer.
	useEffect(() => {
		if (!announce.text) return;
		const t = setTimeout(
			() => setAnnounce((prev) => ({ text: "", seq: prev.seq })),
			ANNOUNCE_VISIBLE_MS,
		);
		return () => clearTimeout(t);
	}, [announce]);

	const handleApply = (p: PresetTag): void => {
		onApply(p);
		const text = `Enabled ${plural(countByPreset[p], "conversion")}, not yet saved.`;
		setAnnounce((prev) => ({ text, seq: prev.seq + 1 }));
	};

	return (
		<>
			<div style={S.chipRow}>
				{PresetTags.map((p) => {
					const n = countByPreset[p];
					return (
						<button
							key={p}
							type="button"
							style={S.chip}
							title={`${LABELS[p]}: ${plural(n, "conversion")}`}
							onClick={() => handleApply(p)}
						>
							+ {LABELS[p]} ({n})
						</button>
					);
				})}
			</div>
			{/* Persistent live region, now visible: sighted users get the same
			    confirmation screen readers always got. The element must already
			    exist for a content change to be announced, so it is never
			    remounted; the trailing zero-width space toggles on each apply so
			    re-applying the same preset still changes the text and
			    re-announces. */}
			<div
				role="status"
				aria-live="polite"
				style={announce.text ? ANNOUNCE_TEXT : S.visuallyHidden}
			>
				{announce.text ? announce.text + ZWSP.repeat(announce.seq % 2) : ""}
			</div>
		</>
	);
}
