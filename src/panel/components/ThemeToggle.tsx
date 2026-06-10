import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { S } from "../styles";

// "auto" follows the host admin UI theme; the explicit choices pin a theme
// by setting `data-skn-theme` on the `.skn-panel` root, which the THEME_STYLE
// override blocks in styles.ts key off.
export type ThemeChoice = "auto" | "light" | "dark" | "night";

const STORAGE_KEY = "skn-theme";

const CHOICES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
	{ value: "auto", label: "Auto" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
	{ value: "night", label: "Night" },
];

function readStoredChoice(): ThemeChoice {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw === "auto" || raw === "light" || raw === "dark" || raw === "night")
			return raw;
	} catch {
		// Storage can be unavailable (private mode, blocked third-party
		// storage); fall through to following the host.
	}
	return "auto";
}

// Compact segmented control that pins the panel theme: Auto (follow host),
// Light, Dark, or the red-preserving Night mode for night vision at the
// helm. The choice persists in localStorage under `skn-theme` and is applied
// to the nearest `.skn-panel` ancestor, so the control works wherever it is
// mounted inside the panel tree. Each segment is a 36px touch target.
export default function ThemeToggle(): React.ReactElement {
	const [choice, setChoice] = useState<ThemeChoice>(readStoredChoice);
	const groupRef = useRef<HTMLFieldSetElement>(null);

	useEffect(() => {
		const root = groupRef.current?.closest(".skn-panel");
		if (!root) return;
		if (choice === "auto") root.removeAttribute("data-skn-theme");
		else root.setAttribute("data-skn-theme", choice);
		try {
			window.localStorage.setItem(STORAGE_KEY, choice);
		} catch {
			// Persistence is best-effort; the in-session choice still applies.
		}
	}, [choice]);

	return (
		<fieldset ref={groupRef} style={S.themeToggle}>
			<legend style={S.visuallyHidden}>Panel theme</legend>
			{CHOICES.map((c) => (
				<button
					key={c.value}
					type="button"
					aria-pressed={choice === c.value}
					style={choice === c.value ? S.themeToggleBtnActive : S.themeToggleBtn}
					onClick={() => setChoice(c.value)}
				>
					{c.label}
				</button>
			))}
		</fieldset>
	);
}
