import type * as React from "react";
import type { ExtrasMeta } from "../../api/types.js";
import BatteryMappingEditor from "./extras/BatteryMappingEditor";
import BrightnessMappingEditor from "./extras/BrightnessMappingEditor";
import EngineMappingEditor from "./extras/EngineMappingEditor";
import EngineStaticMappingEditor from "./extras/EngineStaticMappingEditor";
import ExhaustMappingEditor from "./extras/ExhaustMappingEditor";
import FieldEditor from "./extras/FieldEditor";
import SolarMappingEditor from "./extras/SolarMappingEditor";
import TankMappingEditor from "./extras/TankMappingEditor";

interface Props {
	meta: ExtrasMeta;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function ExtrasEditor({
	meta,
	value,
	onChange,
}: Props): React.ReactElement | null {
	switch (meta.type) {
		case "none":
			return null;
		case "batteryMapping":
			return <BatteryMappingEditor value={value} onChange={onChange} />;
		case "engineMapping":
			return <EngineMappingEditor value={value} onChange={onChange} />;
		case "engineStaticMapping":
			return <EngineStaticMappingEditor value={value} onChange={onChange} />;
		case "tankMapping":
			return <TankMappingEditor value={value} onChange={onChange} />;
		case "solarMapping":
			return <SolarMappingEditor value={value} onChange={onChange} />;
		case "brightnessMapping":
			return <BrightnessMappingEditor value={value} onChange={onChange} />;
		case "exhaustMapping":
			return <ExhaustMappingEditor value={value} onChange={onChange} />;
		case "field":
		case "fields":
			return <FieldEditor meta={meta} value={value} onChange={onChange} />;
	}
}
