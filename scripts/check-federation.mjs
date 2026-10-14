import { createRequire } from "node:module";
import { federationOptions, strictShares } from "./federation-policy.mjs";

const require = createRequire(import.meta.url);
const offenders = strictShares(federationOptions(require("../webpack.config.cjs")).shared);

if (offenders.length > 0) {
	console.error(
		`webpack.config.cjs sets strictVersion on ${offenders.join(", ")}. Signal K Admin 2.24 ` +
			"registers React as 19.0.0, so a strict share never mounts the panel there.",
	);
	process.exit(1);
}

process.stdout.write("Module Federation shares are non-strict.\n");
