import type * as React from "react";
import type { ExtrasMeta } from "../../api/types.js";
import AcMappingEditor from "./extras/AcMappingEditor";
import BatteryMappingEditor from "./extras/BatteryMappingEditor";
import BrightnessMappingEditor from "./extras/BrightnessMappingEditor";
import ChargerMappingEditor from "./extras/ChargerMappingEditor";
import EngineMappingEditor from "./extras/EngineMappingEditor";
import EngineStaticMappingEditor from "./extras/EngineStaticMappingEditor";
import ExhaustMappingEditor from "./extras/ExhaustMappingEditor";
import FieldEditor from "./extras/FieldEditor";
import InverterMappingEditor from "./extras/InverterMappingEditor";
import SolarMappingEditor from "./extras/SolarMappingEditor";
import TankMappingEditor from "./extras/TankMappingEditor";
import VesselTripMappingEditor from "./extras/VesselTripMappingEditor";

interface Props {
	conversionKey: string;
	meta: ExtrasMeta;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function ExtrasEditor({
	conversionKey,
	meta,
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement | null {
	switch (meta.type) {
		case "none":
			return null;
		case "acMapping":
			return <AcMappingEditor value={value} onChange={onChange} availablePaths={availablePaths} />;
		case "batteryMapping":
			return (
				<BatteryMappingEditor value={value} onChange={onChange} availablePaths={availablePaths} />
			);
		case "chargerMapping":
			return (
				<ChargerMappingEditor value={value} onChange={onChange} availablePaths={availablePaths} />
			);
		case "inverterMapping":
			return (
				<InverterMappingEditor value={value} onChange={onChange} availablePaths={availablePaths} />
			);
		case "engineMapping":
			return (
				<EngineMappingEditor
					conversionKey={conversionKey}
					value={value}
					onChange={onChange}
					availablePaths={availablePaths}
				/>
			);
		case "engineStaticMapping":
			return (
				<EngineStaticMappingEditor
					value={value}
					onChange={onChange}
					availablePaths={availablePaths}
				/>
			);
		case "vesselTripMapping":
			return (
				<VesselTripMappingEditor
					value={value}
					onChange={onChange}
					availablePaths={availablePaths}
				/>
			);
		case "tankMapping":
			return (
				<TankMappingEditor value={value} onChange={onChange} availablePaths={availablePaths} />
			);
		case "solarMapping":
			return (
				<SolarMappingEditor value={value} onChange={onChange} availablePaths={availablePaths} />
			);
		case "brightnessMapping":
			return (
				<BrightnessMappingEditor
					value={value}
					onChange={onChange}
					availablePaths={availablePaths}
				/>
			);
		case "exhaustMapping":
			return (
				<ExhaustMappingEditor value={value} onChange={onChange} availablePaths={availablePaths} />
			);
		case "field":
		case "fields":
			return <FieldEditor meta={meta} value={value} onChange={onChange} />;
		default: {
			// Exhaustiveness guard: adding a new ExtrasMeta variant without a
			// case above becomes a compile error here rather than silently
			// returning undefined (which violates the ReactElement | null
			// contract).
			const _exhaustive: never = meta;
			return _exhaustive;
		}
	}
}
