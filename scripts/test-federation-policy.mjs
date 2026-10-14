import assert from "node:assert/strict";
import { federationOptions, strictShares } from "./federation-policy.mjs";

class ModuleFederationPlugin {
	constructor(options) {
		this.options = options;
	}
}

const nonStrict = {
	react: { singleton: true, requiredVersion: "^19.2.0", import: false },
	"react-dom": { singleton: true, requiredVersion: "^19.2.0", import: false },
};
const config = { plugins: [{}, new ModuleFederationPlugin({ name: "panel", shared: nonStrict })] };

assert.equal(federationOptions(config).shared, nonStrict);
assert.equal(federationOptions([config]).shared, nonStrict);
assert.deepEqual(strictShares(nonStrict), []);
assert.deepEqual(strictShares(undefined), []);

// The 1.10.8 defect, and the same defect in webpack's array form.
assert.deepEqual(
	strictShares({ ...nonStrict, react: { ...nonStrict.react, strictVersion: true } }),
	["react"],
);
assert.deepEqual(strictShares(["lodash", { "react-dom": { strictVersion: true } }]), ["react-dom"]);
assert.deepEqual(strictShares({ react: { strictVersion: false } }), []);

// Options kept on the older private field are still read.
const legacy = new ModuleFederationPlugin(undefined);
legacy._options = { shared: nonStrict };
assert.equal(federationOptions({ plugins: [legacy] }).shared, nonStrict);

// An unreadable or missing plugin fails instead of passing.
assert.throws(() => federationOptions({ plugins: [] }), /found 0/);
assert.throws(
	() => federationOptions({ plugins: [new ModuleFederationPlugin(undefined)] }),
	/could not read/,
);

process.stdout.write("Federation share guard tests passed.\n");
