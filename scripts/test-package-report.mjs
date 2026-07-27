import assert from "node:assert/strict";
import { normalizePackReport } from "./package-report.mjs";

const report = { entryCount: 1, files: [{ path: "package.json" }] };

assert.equal(normalizePackReport(report), report);
assert.equal(normalizePackReport([report]), report);
assert.equal(normalizePackReport({ "test-package": report }), report);
assert.throws(() => normalizePackReport([]), /no package report/);
assert.throws(() => normalizePackReport(null), /no package report/);
assert.throws(() => normalizePackReport({ first: report, second: report }), /no package report/);

process.stdout.write("Package report compatibility tests passed.\n");
