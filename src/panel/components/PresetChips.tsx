import type * as React from "react";
import { type PresetTag, PresetTags } from "../../config/enums";
import { S } from "../styles";

const LABELS: Record<PresetTag, string> = {
	"basic-nav": "Basic Navigation",
	"engine-set": "Engine Set",
	"full-ais": "Full AIS",
	environmental: "Environmental",
	raymarine: "Raymarine",
};

interface Props {
	onApply: (preset: PresetTag) => void;
}

export default function PresetChips({ onApply }: Props): React.ReactElement {
	return (
		<div style={S.chipRow}>
			{PresetTags.map((p) => (
				<button key={p} type="button" style={S.chip} onClick={() => onApply(p)}>
					+ {LABELS[p]}
				</button>
			))}
		</div>
	);
}
