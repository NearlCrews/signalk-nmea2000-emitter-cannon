import type * as React from "react";
import { useMemo, useState } from "react";
import type { ConversionMetadata } from "../../api/types.js";
import { type PresetTag, PresetTags } from "../../config/enums";
import { plural } from "../recency";
import { S } from "../styles";

const LABELS: Record<PresetTag, string> = {
	"basic-nav": "Basic Navigation",
	"engine-set": "Engine Set",
	"full-ais": "Full AIS",
	environmental: "Environmental",
	raymarine: "Raymarine",
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

	// Live-region message announced after a chip is applied. The seq counter
	// drives the zero-width-space toggle so a repeated apply still re-announces.
	const [announce, setAnnounce] = useState<{ text: string; seq: number }>({
		text: "",
		seq: 0,
	});

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
			{/* Persistent live region: the element must already exist for a
			    content change to be announced, so it is never remounted. The
			    trailing zero-width space toggles on each apply so re-applying
			    the same preset still changes the text and re-announces. */}
			<div role="status" aria-live="polite" style={S.visuallyHidden}>
				{announce.text ? announce.text + ZWSP.repeat(announce.seq % 2) : ""}
			</div>
		</>
	);
}
