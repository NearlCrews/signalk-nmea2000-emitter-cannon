import { getPGNWithNumber } from "@canboat/ts-pgns";
import { describe, expect, it } from "vitest";
import { PGN_SUMMARIES } from "../api/pgnSummaries.js";
import type { N2KMessage } from "../types/index.js";
import { CANBOAT_PGN_PRIORITIES, withCanonicalPgnPriority } from "../utils/pgnPriorities.js";

function definedPriorities(pgn: number): number[] {
	return (getPGNWithNumber(pgn) ?? [])
		.filter((definition) => pgn !== 65288 || definition.Id === "seatalkAlarm")
		.map((definition) => definition.Priority)
		.filter((value): value is number => typeof value === "number");
}

describe("canonical PGN priorities", () => {
	it("matches the bundled Canboat definitions where they declare a priority", () => {
		for (const [pgnText, priority] of Object.entries(CANBOAT_PGN_PRIORITIES)) {
			const pgn = Number(pgnText);
			if (pgn === 126464) continue;

			expect(definedPriorities(pgn), `PGN ${pgn}`).toContain(priority);
		}
	});

	it("covers every emitted PGN whose bundled definition declares a priority", () => {
		for (const pgnText of Object.keys(PGN_SUMMARIES)) {
			const pgn = Number(pgnText);
			if (definedPriorities(pgn).length === 0) continue;
			expect(CANBOAT_PGN_PRIORITIES[pgn], `PGN ${pgn}`).toBeDefined();
		}
	});

	it("includes the PGN 126464 priority added in Canboat 7.1", () => {
		expect(CANBOAT_PGN_PRIORITIES[126464]).toBe(6);
	});

	it("corrects known priorities without mutating conversion output", () => {
		const message: N2KMessage = {
			prio: 2,
			pgn: 129038,
			dst: 255,
			fields: {},
		};

		expect(withCanonicalPgnPriority(message)).toEqual({
			...message,
			prio: 4,
		});
		expect(message.prio).toBe(2);
	});

	it("preserves messages whose PGN has no defined standard priority", () => {
		const message: N2KMessage = {
			prio: 2,
			pgn: 126720,
			dst: 255,
			fields: {},
		};

		expect(withCanonicalPgnPriority(message)).toBe(message);
	});
});
