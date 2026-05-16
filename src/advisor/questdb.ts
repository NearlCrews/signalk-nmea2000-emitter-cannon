import type { HistoricPaths } from "./types.js";

export interface QuestDBConfig {
	url: string;
}

export interface QueryResult {
	columns: { name: string; type: string }[];
	dataset: unknown[][];
}

const QUERY_TIMEOUT_MS = 4000;

/**
 * Minimal QuestDB HTTP REST client. `fetchImpl` is injectable so tests can
 * run without a server; production passes the global `fetch`.
 */
export class QuestDBClient {
	constructor(
		private readonly cfg: QuestDBConfig,
		private readonly fetchImpl: typeof fetch = fetch,
	) {}

	/** True when QuestDB answers a trivial query. Never throws. */
	async probe(): Promise<boolean> {
		try {
			const r = await this.query("SELECT 1");
			return Array.isArray(r.dataset);
		} catch {
			return false;
		}
	}

	/** Run a SQL query. Throws on a non-OK response or transport failure. */
	async query(sql: string): Promise<QueryResult> {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
		try {
			const url = `${this.cfg.url}/exec?query=${encodeURIComponent(sql)}`;
			const res = await this.fetchImpl(url, { signal: ctrl.signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as Partial<QueryResult>;
			return { columns: body.columns ?? [], dataset: body.dataset ?? [] };
		} finally {
			clearTimeout(timer);
		}
	}
}

function toStats(row: unknown[]): { samples: number; lastSeen: string } {
	const samples = typeof row[1] === "number" ? row[1] : 0;
	const lastSeen = typeof row[2] === "string" ? row[2] : "";
	return { samples, lastSeen };
}

/**
 * Distinct Signal K paths recorded in QuestDB within the last `lookbackDays`
 * days, with a sample count and last-seen timestamp per path. Reads the
 * numeric `signalk` and string `signalk_str` tables, and treats any rows in
 * `signalk_position` as the `navigation.position` path. `lookbackDays` is a
 * validated positive integer from config, so it is safe to interpolate.
 */
export async function fetchHistoricPaths(
	client: QuestDBClient,
	lookbackDays: number,
): Promise<HistoricPaths> {
	const since = `dateadd('d', -${Math.trunc(lookbackDays)}, now())`;
	const out: HistoricPaths = new Map();

	for (const table of ["signalk", "signalk_str"]) {
		const r = await client.query(
			`SELECT path, count() samples, max(ts) last_seen FROM ${table} WHERE ts > ${since} GROUP BY path`,
		);
		for (const row of r.dataset) {
			if (typeof row[0] === "string") out.set(row[0], toStats(row));
		}
	}

	const pos = await client.query(
		`SELECT count() samples, max(ts) last_seen FROM signalk_position WHERE ts > ${since}`,
	);
	const posRow = pos.dataset[0];
	if (posRow && typeof posRow[0] === "number" && posRow[0] > 0) {
		out.set("navigation.position", {
			samples: posRow[0],
			lastSeen: typeof posRow[1] === "string" ? posRow[1] : "",
		});
	}

	return out;
}
