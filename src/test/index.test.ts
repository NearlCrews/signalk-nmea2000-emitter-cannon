import { FromPgn, pgnToActisenseSerialFormat } from "@canboat/canboatjs";
import { beforeEach, describe, expect, it } from "vitest";
import { PGN_SUMMARIES } from "../api/pgnSummaries.js";
import { RootConfig } from "../config/schema.js";
import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import { createConversionModules } from "../conversions/index.js";
import type { ConversionModule, SignalKApp, SignalKPlugin } from "../types/index.js";
import { cleanN2KMessage, validateN2KMessage } from "../utils/messageUtils.js";
import { isDefined } from "../utils/pathUtils.js";
import { withCanonicalPgnPriority } from "../utils/pgnPriorities.js";
import { extractPgnsFromTitle } from "../utils/pgnUtils.js";
import { validateN2KMessageStrict } from "./strictValidation.js";

/**
 * Mock Signal K data storage
 */
let skSelfData: Record<string, unknown> = {};
let skData: Record<string, unknown> = {};

/**
 * Mock Signal K application
 */
const mockApp: SignalKApp = {
	selfId: "urn:mrn:imo:mmsi:111222333",
	getSelfPath: (path: string) => skSelfData[path],
	getPath: (path: string) => skData[path],
	debug: () => {}, // Silent during tests
	error: (msg: string) => console.error(msg),
	emit: () => {},
	streambundle: {
		getSelfBus: () => {
			interface MockStream {
				value: null;
				map: () => MockStream;
				filter: () => MockStream;
				onValue: () => () => void;
			}
			const mockStream: MockStream = {
				value: null,
				map: () => mockStream,
				filter: () => mockStream,
				onValue: () => () => {},
			};
			return mockStream;
		},
	},
	subscriptionmanager: {
		subscribe: () => {},
	},
} as unknown as SignalKApp;

/**
 * Mock plugin instance
 */
const mockPlugin: SignalKPlugin = {
	id: "signalk-nmea2000-emitter-cannon",
	name: "Test Plugin",
	description: "Test plugin",
	schema: () => RootConfig,
	start: () => {},
	stop: () => {},
};

describe("Conversion modules", () => {
	let conversions: ConversionModule[];
	const parser = new FromPgn();

	beforeEach(() => {
		conversions = createConversionModules(mockApp, mockPlugin);
		skSelfData = {};
		skData = {};
	});

	it("should load all conversion modules", () => {
		// Pin to the known count so that a factory throwing at load time
		// (silently caught in createConversionModules and returning []) is
		// a test failure rather than a silent drop. Update this constant
		// intentionally when adding or removing modules.
		expect(conversions.length).toBe(76);
	});

	it("has a PGN summary for every emitted PGN", () => {
		// The admin panel renders a hover tooltip per PGN chip from
		// PGN_SUMMARIES. meta.pgns is derived from conversion titles, so a
		// new conversion can introduce a PGN with no summary: this guards
		// against that drift, mirroring findOrphanExtrasMetaKeys.
		const missing = new Set<string>();
		for (const conversion of conversions) {
			for (const pgn of extractPgnsFromTitle(conversion.title)) {
				if (PGN_SUMMARIES[Number(pgn)] === undefined) {
					missing.add(pgn);
				}
			}
		}
		expect([...missing]).toEqual([]);
	});

	it("should have tests for every conversion", () => {
		for (const conversion of conversions) {
			const conversionArray = Array.isArray(conversion) ? conversion : [conversion];

			for (const conv of conversionArray) {
				// Get sub-conversions
				let subConversions = conv.conversions;
				if (!subConversions) {
					subConversions = [conv];
				} else if (typeof subConversions === "function") {
					const testOptions = Array.isArray(conv.testOptions)
						? conv.testOptions[0]
						: conv.testOptions;
					subConversions = subConversions(testOptions || {});
				}

				if (subConversions) {
					for (const subConv of subConversions) {
						expect(subConv.tests).toBeDefined();
						expect(subConv.tests).not.toHaveLength(0);
					}
				}
			}
		}
	});

	it("should execute all conversion tests", async () => {
		for (const conversion of conversions) {
			const conversionArray = Array.isArray(conversion) ? conversion : [conversion];

			for (const conv of conversionArray) {
				const optionsList = Array.isArray(conv.testOptions) ? conv.testOptions : [conv.testOptions];

				for (const [_optionIndex, options] of optionsList.entries()) {
					// Get sub-conversions
					let subConversions = conv.conversions;
					if (!subConversions) {
						subConversions = [conv];
					} else if (typeof subConversions === "function") {
						subConversions = subConversions(options || {});
					}

					if (subConversions) {
						for (const subConv of subConversions) {
							if (subConv.tests) {
								for (const [_testIndex, test] of subConv.tests.entries()) {
									// Set up test data
									skData = test.skData || {};
									skSelfData = test.skSelfData || {};

									// Drive onOptionsLoaded for conversions that pull
									// values from plugin config (extras) rather than from
									// path subscriptions: the test-level testOptions stand
									// in for the live options the plugin-manager would
									// otherwise pass on lifecycle start.
									if (test.testOptions && conv.onOptionsLoaded) {
										conv.onOptionsLoaded({
											enabled: true,
											...test.testOptions,
										});
									}

									// Execute the conversion callback
									const result = subConv.callback?.(...test.input);

									if (!result) {
										continue;
									}

									const results = await Promise.resolve(result);
									if (!Array.isArray(results)) {
										throw new Error(`Expected array but got: ${typeof results}`);
									}

									const validResults = results.filter(isDefined);
									const pgns = await Promise.all(validResults);

									expect(pgns).toHaveLength(test.expected.length);

									// Test each PGN
									for (const [pgnIndex, pgn] of pgns.entries()) {
										expect(pgn).toBeTruthy();
										expect(typeof pgn).toBe("object");
										expect(pgn.pgn).toBeDefined();

										// Catches wrong field names and unknown enum strings
										// that canboatjs would otherwise silently drop or
										// zero-encode. PGN 65288 (Raymarine vendor-specific)
										// carries an internal `path` field that is not in the
										// canboat definition, so the strict check is skipped
										// for it.
										if (pgn.pgn !== 65288) {
											expect(() => validateN2KMessageStrict(pgn)).not.toThrow();
										}

										// Validate with CanboatJS
										const wirePgn = withCanonicalPgnPriority(pgn);
										// canboatjs accepts plain PGN JSON at runtime, but its declaration
										// exposes only the generated PGN class hierarchy.
										const encoded = pgnToActisenseSerialFormat(
											wirePgn as unknown as Parameters<typeof pgnToActisenseSerialFormat>[0],
										);
										expect(encoded).toBeTruthy();

										if (!encoded) {
											throw new Error("Failed to encode N2K message");
										}

										const parsed = parser.parseString(encoded);
										expect(parsed).toBeTruthy();

										if (!parsed) {
											throw new Error("Failed to parse N2K message");
										}

										// Clean up parsed message
										const cleanParsed = cleanN2KMessage(
											parsed as unknown as Record<string, unknown>,
										);

										let expected = test.expected[pgnIndex];
										if (typeof expected === "function") {
											expected = expected(options);
										}
										expected = withCanonicalPgnPriority(expected);

										// Handle preprocessing if defined
										if ("__preprocess__" in expected) {
											const expectedWithPreprocess = expected as Record<string, unknown> & {
												__preprocess__?: (testResult: Record<string, unknown>) => void;
											};
											const preprocess = expectedWithPreprocess.__preprocess__;
											if (typeof preprocess === "function") {
												preprocess(cleanParsed as unknown as Record<string, unknown>);
											}
											delete expectedWithPreprocess.__preprocess__;
										}

										// Validate the parsed message matches expected
										expect(cleanParsed).toEqual(expected);
									}
								}
							}
						}
					}
				}
			}
		}
	});

	describe("Message validation", () => {
		it("should validate N2K message structure", () => {
			const validMessage = {
				prio: N2K_DEFAULT_PRIORITY,
				pgn: 130306,
				dst: N2K_BROADCAST_DST,
				fields: {
					windSpeed: 1.2,
					windAngle: 2.0944,
					reference: "Apparent",
				},
			};

			expect(() => validateN2KMessage(validMessage)).not.toThrow();
		});

		it("should reject invalid N2K messages", () => {
			const validMessage = {
				prio: N2K_DEFAULT_PRIORITY,
				pgn: 130306,
				dst: N2K_BROADCAST_DST,
				fields: {},
			};

			const invalidMessages = [
				{ ...validMessage, prio: 1.5 },
				{ ...validMessage, prio: 8 },
				{ ...validMessage, pgn: 130306.5 },
				{ ...validMessage, pgn: 0x40000 },
				{ ...validMessage, dst: 12.5 },
				{ ...validMessage, dst: 256 },
				{ ...validMessage, fields: [] },
				{ ...validMessage, fields: { nested: new Date() } },
			];

			for (const invalidMessage of invalidMessages) {
				expect(() => validateN2KMessage(invalidMessage)).toThrow();
			}
		});
	});
});
