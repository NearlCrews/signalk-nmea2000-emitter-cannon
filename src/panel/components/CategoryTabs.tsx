import type * as React from "react";
import { Categories } from "../../config/schema";
import type { ConversionCategory } from "../../config/schema.js";
import { S } from "../styles";

const LABELS: Record<ConversionCategory, string> = {
	navigation: "Navigation",
	engine: "Engine",
	electrical: "Electrical",
	tanks: "Tanks",
	environment: "Environment",
	ais: "AIS",
	comms: "Comms",
	system: "System",
};

interface Props {
	active: ConversionCategory;
	onChange: (next: ConversionCategory) => void;
	countsByCategory: Record<ConversionCategory, number>;
}

export default function CategoryTabs({
	active,
	onChange,
	countsByCategory,
}: Props): React.ReactElement {
	return (
		<div style={S.tabs}>
			{Categories.map((c) => (
				<button
					key={c}
					style={{ ...S.tab, ...(active === c ? S.tabActive : {}) }}
					onClick={() => onChange(c)}
					type="button"
				>
					{LABELS[c]}{" "}
					<span style={{ color: "#999" }}>({countsByCategory[c] ?? 0})</span>
				</button>
			))}
		</div>
	);
}
