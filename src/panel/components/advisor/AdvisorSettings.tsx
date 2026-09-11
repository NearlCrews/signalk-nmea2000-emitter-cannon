import type * as React from "react";
import { useId, useState } from "react";
import {
	Button,
	Checkbox,
	Cluster,
	LabeledField,
	NumberField,
	Section,
	Stack,
	StatusIndicator,
	type StatusTone,
	Text,
	TextInput,
} from "signalk-nearlcrews-ui";
import { DEFAULT_ADVISOR_CONFIG } from "../../../config/enums.js";
import type { Config } from "../../../config/schema.js";
import { fetchJson, friendlyApiError } from "../../api-base";
import { ADVISOR_UNAVAILABLE_503 } from "../../hooks/useAdvisor.js";

type AdvisorCfg = NonNullable<Config["advisor"]>;

interface Props {
	value: Config["advisor"];
	onChange: (next: AdvisorCfg) => void;
	// True when the advisor settings carry unsaved edits. The connection-test
	// probes hit the live router, which reads the SAVED config, so the Test
	// buttons block while true (the inline hints explain why).
	advisorSettingsDirty: boolean;
}

type ProbeState =
	| { phase: "idle" }
	| { phase: "testing" }
	| { phase: "ok"; message: string }
	| { phase: "fail"; message: string };

const PROBE_TONES: Record<ProbeState["phase"], StatusTone> = {
	idle: "neutral",
	testing: "info",
	ok: "success",
	fail: "danger",
};

/**
 * Inline pass/fail readout for a connection probe. A persistent polite live
 * region, so a screen reader announces the result when the phase flips; it
 * always carries text so the region exists before the text changes.
 */
function ProbeStatus({ probe }: { probe: ProbeState }): React.ReactElement {
	const text =
		probe.phase === "idle"
			? "Not tested yet"
			: probe.phase === "testing"
				? "Testing..."
				: probe.message;
	return (
		<StatusIndicator live="polite" tone={PROBE_TONES[probe.phase]}>
			{text}
		</StatusIndicator>
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
	const questdbTestHintId = useId();
	const [questdbTest, setQuestdbTest] = useState<ProbeState>({ phase: "idle" });

	const patch = (part: Partial<AdvisorCfg>): void => {
		onChange({ ...cfg, ...part });
	};

	// The probe hits the live router, which reads the SAVED config (not this
	// in-memory form), which is why the Test button is disabled while the
	// advisor settings carry unsaved edits. The guarded routes answer 403 on a
	// server without admin middleware; friendlyApiError turns that into the
	// admin-session next step.
	//
	// `notConfiguredMessage` covers the second way a probe fails: the server
	// reports `configured: false` when there is no usable saved URL to try, so
	// the readout can say that instead of blaming an unreachable server.
	const runProbe = async (
		setProbe: React.Dispatch<React.SetStateAction<ProbeState>>,
		path: string,
		init: RequestInit | undefined,
		okMessage: string,
		failMessage: string,
		notConfiguredMessage?: string,
	): Promise<void> => {
		setProbe({ phase: "testing" });
		try {
			const body = await fetchJson<{ ok: boolean; configured?: boolean }>(path, init);
			if (body.ok) {
				setProbe({ phase: "ok", message: okMessage });
				return;
			}
			setProbe({
				phase: "fail",
				message:
					body.configured === false && notConfiguredMessage !== undefined
						? notConfiguredMessage
						: failMessage,
			});
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
			// POST because the server makes an outbound request to the saved URL.
			{ method: "POST" },
			"Connected to QuestDB.",
			"Could not reach QuestDB at that URL. Check the URL, that QuestDB is enabled, and that you saved.",
			"No QuestDB URL is saved to test. Enter the REST URL, for example http://localhost:9000, then save.",
		);

	return (
		<Stack gap={3}>
			<Checkbox
				label="Enable the Config Advisor"
				description="When enabled, the advisor can review on a schedule. The Review now button above always works regardless of this toggle."
				checked={cfg.enabled}
				onChange={(e) => patch({ enabled: e.target.checked })}
			/>
			<Checkbox
				label="Apply recommended enables automatically"
				description="When on, a review enables recommended conversions for you right away. When off, those enables wait for your approval. Recommendations that disable a conversion always wait for your approval."
				checked={cfg.autoApply}
				onChange={(e) => patch({ autoApply: e.target.checked })}
			/>

			<Section
				title="QuestDB history (optional)"
				headingLevel={4}
				landmark={false}
				description="If you run QuestDB with Signal K history, the advisor can also see paths that are not live right now. Leave disabled if you do not run QuestDB."
			>
				<Stack gap={3}>
					<Checkbox
						label="Use QuestDB history"
						checked={cfg.questdb.enabled}
						onChange={(e) => patch({ questdb: { ...cfg.questdb, enabled: e.target.checked } })}
					/>
					{/* Deliberately not type="url": the field is edited character by
					    character, and a native url control reports every partial value
					    as invalid while the user is still typing. */}
					<LabeledField label="QuestDB REST URL">
						<TextInput
							type="text"
							value={cfg.questdb.url}
							onChange={(e) => patch({ questdb: { ...cfg.questdb, url: e.target.value } })}
						/>
					</LabeledField>
					<Cluster gap={2}>
						{/* Blocked, not removed from the tab order: a natively disabled
						    button is skipped by keyboard, so the hint below explaining
						    the block would never be reached from the control it
						    explains. The hint describes the button rather than the URL
						    field, which is what it is actually about. */}
						<Button
							size="compact"
							onClick={() => void runQuestdbTest()}
							loading={questdbTest.phase === "testing"}
							loadingLabel="Testing"
							ariaDisabled={advisorSettingsDirty}
							aria-describedby={questdbTestHintId}
						>
							Test connection
						</Button>
						<ProbeStatus probe={questdbTest} />
					</Cluster>
					<Text as="p" id={questdbTestHintId} tone="muted" size="sm">
						Test connection checks the saved URL. If you just changed it, Save first.
					</Text>
					<NumberField
						label="History look-back (days)"
						description="How far into QuestDB history to search for paths that are not live right now. Longer catches seasonal gear; shorter is faster."
						layout="inline"
						value={cfg.questdb.lookbackDays}
						onValueChange={(n) => patch({ questdb: { ...cfg.questdb, lookbackDays: n } })}
						min={1}
						integer
						fallback={1}
					/>
				</Stack>
			</Section>

			<Section
				title="Scheduled review"
				headingLevel={4}
				landmark={false}
				description="Re-run the review automatically on an interval. The Review now button always works on demand regardless of this setting."
			>
				<Stack gap={3}>
					<Checkbox
						label="Review on a schedule"
						checked={cfg.schedule.periodic}
						onChange={(e) =>
							patch({
								schedule: { ...cfg.schedule, periodic: e.target.checked },
							})
						}
					/>
					<NumberField
						label="Review every (days)"
						layout="inline"
						value={cfg.schedule.intervalDays}
						onValueChange={(n) => patch({ schedule: { ...cfg.schedule, intervalDays: n } })}
						min={1}
						integer
						fallback={1}
					/>
				</Stack>
			</Section>
		</Stack>
	);
}
