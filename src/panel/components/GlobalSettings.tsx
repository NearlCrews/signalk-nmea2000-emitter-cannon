import type * as React from "react";
import { CollapsibleSection, NumberField } from "signalk-nearlcrews-ui";
import { GLOBAL_RESEND_HELP } from "../../config/enums.js";

interface Props {
	value: number;
	onChange: (next: number) => void;
}

/**
 * Global settings as a compact collapsible section: the resend interval is set
 * once and rarely revisited, so it should not occupy a permanent card ahead
 * of the conversion catalog. The header summary keeps the effective interval
 * visible while the editor is collapsed.
 */
export default function GlobalSettings({ value, onChange }: Props): React.ReactElement {
	return (
		<CollapsibleSection
			title="Global settings"
			summary={value === 0 ? "Global resend off" : `Resend every ${value} s`}
			summaryPlacement="header"
			summaryVisibility="always"
		>
			<NumberField
				label="Global resend interval"
				unit="seconds"
				description={GLOBAL_RESEND_HELP}
				layout="inline"
				value={value}
				onValueChange={onChange}
				min={0}
				integer
				fallback={0}
			/>
		</CollapsibleSection>
	);
}
