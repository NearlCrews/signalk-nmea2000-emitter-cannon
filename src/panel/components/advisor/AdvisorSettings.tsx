import type * as React from "react";
import { useState } from "react";
import { DEFAULT_ADVISOR_CONFIG } from "../../../config/enums.js";
import type { Config } from "../../../config/schema.js";
import { fetchJson, friendlyApiError } from "../../api-base";
import { ADVISOR_UNAVAILABLE_503 } from "../../hooks/useAdvisor.js";
import { S } from "../../styles";
import NumberInput from "../NumberInput";

type AdvisorCfg = NonNullable<Config["advisor"]>;

interface Props {
	value: Config["advisor"];
	onChange: (next: AdvisorCfg) => void;
	// True when the advisor settings carry unsaved edits. The connection-test
	// probes hit the live router, which reads the SAVED config, so the Test
	// buttons are disabled while true (the inline hints explain why).
	advisorSettingsDirty: boolean;
}

// A whole checkbox row is one <label>, so tapping the text toggles the box.
// S.fieldRow lays it out; the pointer cursor signals the row is clickable.
const checkboxRow: React.CSSProperties = { ...S.fieldRow, cursor: "pointer" };

// Primary toggle labels reuse the wizard row text (full text color: S.label's
// muted gray read as disabled next to a live checkbox) and flex with the row
// instead of holding a fixed column, so tablets do not get a dead gutter.
const toggleLabel: React.CSSProperties = {
	...S.wizardRowText,
	flex: "1 1 auto",
	minWidth: 160,
};

type ProbeState =
	| { phase: "idle" }
	| { phase: "testing" }
	| { phase: "ok"; message: string }
	| { phase: "fail"; message: string };

/**
 * Inline pass/fail readout for a connection probe. A persistent role="status"
 * live region (so a screen reader announces the result when the phase flips);
 * it stays mounted with empty text while idle so the region exists before the
 * text changes.
 */
function ProbeStatus({ probe }: { probe: ProbeState }): React.ReactElement {
	let style: React.CSSProperties | undefined;
	let text = "";
	if (probe.phase === "testing") {
		style = S.textSmallMuted;
		text = "Testing...";
	} else if (probe.phase === "ok") {
		style = S.textSmallSuccess;
		text = probe.message;
	} else if (probe.phase === "fail") {
		style = S.textSmallDanger;
		text = probe.message;
	}
	return (
		<span role="status" style={style}>
			{text}
		</span>
	);
}

/**
 * The advisor settings form: master toggle plus QuestDB and schedule
 * sub-sections. Every row carries inline help so the user does not have to
 * guess what an option does. Values persist through the panel's normal Save
 * button.
 */
export default function AdvisorSettings({
	value,
	onChange,
	advisorSettingsDirty,
}: Props): React.ReactElement {
	const cfg: AdvisorCfg = value ?? DEFAULT_ADVISOR_CONFIG;
	const [questdbTest, setQuestdbTest] = useState<ProbeState>({ phase: "idle" });

	const patch = (part: Partial<AdvisorCfg>): void => {
		onChange({ ...cfg, ...part });
	};

	// The probe hits the live router, which reads the SAVED config (not this
	// in-memory form), which is why the Test button is disabled while the
	// advisor settings carry unsaved edits. The guarded routes answer 403 on a
	// server without admin middleware; friendlyApiError turns that into the
	// admin-session next step.
	const runProbe = async (
		setProbe: React.Dispatch<React.SetStateAction<ProbeState>>,
		path: string,
		init: RequestInit | undefined,
		okMessage: string,
		failMessage: string,
	): Promise<void> => {
		setProbe({ phase: "testing" });
		try {
			const body = await fetchJson<{ ok: boolean }>(path, init);
			setProbe(
				body.ok
					? { phase: "ok", message: okMessage }
					: { phase: "fail", message: failMessage },
			);
		} catch (err) {
			setProbe({
				phase: "fail",
				message: friendlyApiError(err, ADVISOR_UNAVAILABLE_503),
			});
		}
	};

	const runQuestdbTest = (): Promise<void> =>
		runProbe(
			setQuestdbTest,
			"/advisor/questdb-test",
			undefined,
			"Connected to QuestDB.",
			"Could not reach QuestDB at that URL. Check the URL, that QuestDB is enabled, and that you saved.",
		);

	return (
		<div>
			<label style={checkboxRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.enabled}
					onChange={(e) => patch({ enabled: e.target.checked })}
				/>
				<span style={toggleLabel}>Enable the Config Advisor</span>
			</label>
			<p style={S.helpHint}>
				When enabled, the advisor can review on a schedule. The Review now
				button above always works regardless of this toggle.
			</p>

			<label style={checkboxRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.autoApply}
					onChange={(e) => patch({ autoApply: e.target.checked })}
				/>
				<span style={toggleLabel}>Apply recommended enables automatically</span>
			</label>
			<p style={S.helpHint}>
				When on, a review enables recommended conversions for you right away.
				When off, those enables wait for your approval. Recommendations that
				disable a conversion always wait for your approval.
			</p>

			<div style={S.advisorSubhead}>QuestDB history (optional)</div>
			<p style={S.helpHint}>
				If you run QuestDB with Signal K history, the advisor can also see paths
				that are not live right now. Leave disabled if you do not run QuestDB.
			</p>
			<label style={checkboxRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.questdb.enabled}
					onChange={(e) =>
						patch({ questdb: { ...cfg.questdb, enabled: e.target.checked } })
					}
				/>
				<span style={toggleLabel}>Use QuestDB history</span>
			</label>
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
				<button
					type="button"
					style={S.btnSecondarySm}
					onClick={() => void runQuestdbTest()}
					disabled={questdbTest.phase === "testing" || advisorSettingsDirty}
				>
					Test connection
				</button>
				<ProbeStatus probe={questdbTest} />
			</div>
			<p style={S.helpHint}>
				Test connection checks the saved URL. If you just changed it, Save
				first.
			</p>
			<div style={S.fieldRow}>
				<span style={S.label}>History look-back (days)</span>
				<NumberInput
					value={cfg.questdb.lookbackDays}
					onChange={(n) =>
						patch({
							questdb: { ...cfg.questdb, lookbackDays: n },
						})
					}
					min={1}
					ariaLabel="History look-back in days"
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
			<label style={checkboxRow}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.schedule.periodic}
					onChange={(e) =>
						patch({
							schedule: { ...cfg.schedule, periodic: e.target.checked },
						})
					}
				/>
				<span style={toggleLabel}>Review on a schedule</span>
			</label>
			<div style={S.fieldRow}>
				<span style={S.label}>Review every (days)</span>
				<NumberInput
					value={cfg.schedule.intervalDays}
					onChange={(n) =>
						patch({
							schedule: { ...cfg.schedule, intervalDays: n },
						})
					}
					min={1}
					ariaLabel="Review interval in days"
				/>
			</div>
		</div>
	);
}
