import { DEFAULT_GLOBAL_RESEND_SECONDS } from "../constants.js";
import type { Config, ConversionConfig } from "./schema.js";

export function migrateLegacyConfig(raw: unknown): Config {
	if (
		raw &&
		typeof raw === "object" &&
		"conversions" in raw &&
		typeof (raw as { conversions: unknown }).conversions === "object" &&
		(raw as { conversions: unknown }).conversions !== null
	) {
		return raw as Config;
	}

	const conversions: Record<string, ConversionConfig> = {};
	let globalResendInterval: number = DEFAULT_GLOBAL_RESEND_SECONDS;

	if (raw && typeof raw === "object") {
		for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
			if (key === "globalResendInterval") {
				if (typeof value === "number") globalResendInterval = value;
				continue;
			}
			if (!value || typeof value !== "object") continue;
			const entry = value as Record<string, unknown>;
			const sources: Record<string, string> = {};
			const extras: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(entry)) {
				if (k === "enabled" || k === "resend") continue;
				if (typeof v === "string") sources[k] = v;
				else extras[k] = v;
			}
			conversions[key] = {
				enabled: typeof entry.enabled === "boolean" ? entry.enabled : false,
				resend: typeof entry.resend === "number" ? entry.resend : 0,
				sources,
				extras,
			};
		}
	}

	return { globalResendInterval, conversions };
}
