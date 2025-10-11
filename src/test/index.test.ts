import { FromPgn, pgnToActisenseSerialFormat } from "@canboat/canboatjs";
import { beforeEach, describe, expect, it } from "vitest";
import { createConversionModules } from "../conversions/index.js";
import { schema } from "../schema.js";
import type { ConversionModule, SignalKApp, SignalKPlugin } from "../types/index.js";
import { cleanN2KMessage, validateN2KMessage } from "../utils/messageUtils.js";
import { isDefined } from "../utils/pathUtils.js";

/**
 * Mock Signal K data storage
 */
let skSelfData: Record<string, unknown> = {};
let skData: Record<string, unknown> = {};

/**
 * Mock Signal K application
 */
const mockApp: SignalKApp = {
  getSelfPath: (path: string) => skSelfData[path],
  getPath: (path: string) => skData[path],
  debug: () => {}, // Silent during tests
  error: (msg) => console.error(msg),
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
  signalk: {
    on: () => {},
  },
};

/**
 * Mock plugin instance
 */
const mockPlugin: SignalKPlugin = {
  id: "signalk-nmea2000-emitter-cannon",
  name: "Test Plugin",
  description: "Test plugin",
  schema: () => schema,
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
    expect(conversions.length).toBeGreaterThan(0);
    console.log(`Loaded ${conversions.length} conversion modules`);
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

                  // Execute the conversion callback
                  const result = subConv.callback?.(...test.input);

                  if (!result) {
                    console.log(`Callback returned null for ${conv.title}, skipping test`);
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

                    // Validate with CanboatJS
                    const encoded = pgnToActisenseSerialFormat(pgn);
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
                      parsed as unknown as Record<string, unknown>
                    );

                    let expected = test.expected[pgnIndex];
                    if (typeof expected === "function") {
                      expected = expected(options);
                    }

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
        prio: 2,
        pgn: 130306,
        dst: 255,
        fields: {
          windSpeed: 1.2,
          windAngle: 2.0944,
          reference: "Apparent",
        },
      };

      expect(() => validateN2KMessage(validMessage)).not.toThrow();
    });

    it("should reject invalid N2K messages", () => {
      const invalidMessage = {
        prio: 10, // Invalid priority
        pgn: 130306,
        dst: 255,
        fields: {},
      };

      expect(() => validateN2KMessage(invalidMessage)).toThrow();
    });
  });
});
