import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
	Button,
	Cluster,
	formatCount,
	LiveRegion,
	Stack,
	StatusIndicator,
} from "signalk-nearlcrews-ui";
import type { ConversionMetadata } from "../../api/types.js";
import { type PresetTag, PresetTags } from "../../config/enums";

const LABELS: Record<PresetTag, string> = {
	"basic-nav": "Basic navigation",
	"engine-set": "Engine set",
	"full-ais": "Full AIS",
	environmental: "Environmental",
	raymarine: "Raymarine",
};

// How long the visible "Enabled N conversions" confirmation stays up.
const ANNOUNCE_VISIBLE_MS = 4000;

interface Props {
	onApply: (preset: PresetTag) => void;
	// Conversion catalog, used to count how many conversions each preset
	// enables (those whose `presets` include the tag).
	meta: ConversionMetadata[];
}

export default function PresetChips({ onApply, meta }: Props): React.ReactElement {
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
	// keys the announcement, so re-applying the same preset is spoken again
	// even though the words did not change.
	const [announce, setAnnounce] = useState<{ text: string; seq: number }>({
		text: "",
		seq: 0,
	});

	// The visible confirmation clears after a few seconds. Keyed on the seq
	// counter, which increments on every apply, so a re-apply restarts the
	// timer without the effect also re-running when the text clears.
	// biome-ignore lint/correctness/useExhaustiveDependencies: seq-keying is deliberate; announce.text is only a guard and the clear sets it with an unchanged seq, so depending on it (or the whole object) would just re-run the effect on the clear.
	useEffect(() => {
		if (!announce.text) return;
		const t = setTimeout(
			() => setAnnounce((prev) => ({ text: "", seq: prev.seq })),
			ANNOUNCE_VISIBLE_MS,
		);
		return () => clearTimeout(t);
	}, [announce.seq]);

	const handleApply = (p: PresetTag): void => {
		onApply(p);
		const text = `Enabled ${formatCount(countByPreset[p], "conversion")}, not yet sent to Signal K.`;
		setAnnounce((prev) => ({ text, seq: prev.seq + 1 }));
	};

	return (
		<Stack gap={2}>
			<Cluster gap={2}>
				{PresetTags.map((p) => (
					<Button key={p} shape="pill" size="compact" onClick={() => handleApply(p)}>
						+ {LABELS[p]} ({countByPreset[p]})
					</Button>
				))}
			</Cluster>
			{/* The announcer is always mounted, so a content change is heard; the
			    visible confirmation beside it is not live, so the result is spoken
			    once. The apply counter keys the announcement, so re-applying the
			    same preset repeats it. */}
			<LiveRegion announceKey={announce.seq} message={announce.text} />
			{announce.text ? <StatusIndicator tone="success">{announce.text}</StatusIndicator> : null}
		</Stack>
	);
}
