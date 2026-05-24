import { useCallback, useState } from "react";
import type { AdvisorModelsResponse } from "../../api/types.js";
import { fetchJson } from "../api-base";

export type ModelsState = "idle" | "loading" | "ready" | "error";

/**
 * Lazily fetches the OpenRouter model ids for the advisor model field's
 * autocomplete. The caller triggers `loadModels` on first focus of the field
 * so an install that never opens the advisor settings makes no request.
 */
export function useOpenRouterModels(): {
	models: string[];
	modelsState: ModelsState;
	loadModels: () => Promise<void>;
} {
	const [models, setModels] = useState<string[]>([]);
	const [modelsState, setModelsState] = useState<ModelsState>("idle");

	const loadModels = useCallback(async () => {
		setModelsState("loading");
		try {
			const body = await fetchJson<AdvisorModelsResponse>("/advisor/models");
			setModels(body.models);
			setModelsState("ready");
		} catch {
			setModelsState("error");
		}
	}, []);

	return { models, modelsState, loadModels };
}
