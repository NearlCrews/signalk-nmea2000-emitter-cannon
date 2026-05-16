import type * as React from "react";
import { DEFAULT_ADVISOR_CONFIG } from "../../../config/enums.js";
import type { Config } from "../../../config/schema.js";
import { S } from "../../styles";

type AdvisorCfg = NonNullable<Config["advisor"]>;

interface Props {
	value: Config["advisor"];
	onChange: (next: AdvisorCfg) => void;
}

/**
 * The advisor settings form: master toggle plus OpenRouter, QuestDB, and
 * schedule sub-sections. Every row carries inline help so the user does not
 * have to guess what an option does. Values persist through the panel's
 * normal Save button.
 */
export default function AdvisorSettings({
	value,
	onChange,
}: Props): React.ReactElement {
	const cfg: AdvisorCfg = value ?? DEFAULT_ADVISOR_CONFIG;

	const patch = (part: Partial<AdvisorCfg>): void => {
		onChange({ ...cfg, ...part });
	};

	return (
		<div>
			<div style={S.fieldRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.enabled}
					onChange={(e) => patch({ enabled: e.target.checked })}
					aria-label="Enable the Config Advisor"
				/>
				<span style={S.label}>Enable the Config Advisor</span>
			</div>
			<p style={S.helpHint}>
				When enabled, the advisor can review on a schedule. The Review now
				button below always works regardless of this toggle.
			</p>

			<div style={S.advisorSubhead}>OpenRouter (optional)</div>
			<p style={S.helpHint}>
				The advisor works without OpenRouter using built-in rules. Adding an
				OpenRouter key lets it explain each recommendation in plain language and
				reason about unfamiliar paths.
			</p>
			<div style={S.fieldRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.openRouter.enabled}
					onChange={(e) =>
						patch({
							openRouter: { ...cfg.openRouter, enabled: e.target.checked },
						})
					}
					aria-label="Use OpenRouter"
				/>
				<span style={S.label}>Use OpenRouter for explanations</span>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>OpenRouter API key</span>
				<input
					type="password"
					autoComplete="off"
					style={S.input}
					value={cfg.openRouter.apiKey}
					onChange={(e) =>
						patch({
							openRouter: { ...cfg.openRouter, apiKey: e.target.value },
						})
					}
					aria-label="OpenRouter API key"
				/>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>Model</span>
				<input
					type="text"
					style={S.input}
					value={cfg.openRouter.model}
					onChange={(e) =>
						patch({ openRouter: { ...cfg.openRouter, model: e.target.value } })
					}
					aria-label="OpenRouter model"
				/>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>Max OpenRouter calls per day</span>
				<input
					type="number"
					min={0}
					style={S.input}
					value={cfg.openRouter.maxCallsPerDay}
					onChange={(e) =>
						patch({
							openRouter: {
								...cfg.openRouter,
								maxCallsPerDay: Math.max(0, Number(e.target.value) | 0),
							},
						})
					}
					aria-label="Max OpenRouter calls per day"
				/>
			</div>

			<div style={S.advisorSubhead}>QuestDB history (optional)</div>
			<p style={S.helpHint}>
				If you run QuestDB with Signal K history, the advisor can also see paths
				that are not live right now. Leave disabled if you do not run QuestDB.
			</p>
			<div style={S.fieldRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.questdb.enabled}
					onChange={(e) =>
						patch({ questdb: { ...cfg.questdb, enabled: e.target.checked } })
					}
					aria-label="Use QuestDB history"
				/>
				<span style={S.label}>Use QuestDB history</span>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>QuestDB REST URL</span>
				<input
					type="text"
					style={S.input}
					value={cfg.questdb.url}
					onChange={(e) =>
						patch({ questdb: { ...cfg.questdb, url: e.target.value } })
					}
					aria-label="QuestDB REST URL"
				/>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>History look-back (days)</span>
				<input
					type="number"
					min={1}
					style={S.input}
					value={cfg.questdb.lookbackDays}
					onChange={(e) =>
						patch({
							questdb: {
								...cfg.questdb,
								lookbackDays: Math.max(1, Number(e.target.value) | 0),
							},
						})
					}
					aria-label="History look-back in days"
				/>
			</div>
			<p style={S.helpHint}>
				How far into QuestDB history to search for paths that are not live right
				now. Longer catches seasonal gear; shorter is faster.
			</p>

			<div style={S.advisorSubhead}>Scheduled review</div>
			<p style={S.helpHint}>
				Re-run the review automatically on an interval. The Review now button
				always works on demand regardless of this setting.
			</p>
			<div style={S.fieldRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.schedule.periodic}
					onChange={(e) =>
						patch({
							schedule: { ...cfg.schedule, periodic: e.target.checked },
						})
					}
					aria-label="Review on a schedule"
				/>
				<span style={S.label}>Review on a schedule</span>
			</div>
			<div style={S.fieldRow}>
				<span style={S.label}>Review every (days)</span>
				<input
					type="number"
					min={1}
					style={S.input}
					value={cfg.schedule.intervalDays}
					onChange={(e) =>
						patch({
							schedule: {
								...cfg.schedule,
								intervalDays: Math.max(1, Number(e.target.value) | 0),
							},
						})
					}
					aria-label="Review interval in days"
				/>
			</div>
		</div>
	);
}
