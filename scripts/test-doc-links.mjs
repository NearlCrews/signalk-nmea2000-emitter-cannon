import assert from "node:assert/strict";
import { relativeLinkTargets } from "./doc-links.mjs";

const targets = (markdown) => relativeLinkTargets(markdown).map(({ target }) => target);

assert.deepEqual(
	relativeLinkTargets(
		"# Title\n\nSee the [guide](docs/guide.md) and [notes](../CHANGELOG.md#v1110).",
	),
	[
		{ line: 3, target: "docs/guide.md" },
		{ line: 3, target: "../CHANGELOG.md#v1110" },
	],
);
assert.deepEqual(targets("[License](./LICENSE) and [empty]()"), ["./LICENSE", ""]);

// Absolute URLs, mail, and in-page anchors resolve everywhere.
assert.deepEqual(
	targets(
		'[site](https://example.com "Title") [plain](http://example.com) [mail](mailto:a@b.c) [up](#install)',
	),
	[],
);

// Images are rewritten by the App Store, so relative image paths are allowed,
// including an image wrapped in an absolute link. A relative link around an
// image is still a dead link.
assert.deepEqual(targets("![Panel](assets/screenshots/config-panel.png)"), []);
assert.deepEqual(
	targets("[![CI](https://example.com/badge.svg)](https://example.com/actions)"),
	[],
);
assert.deepEqual(targets("[![Shot](assets/shot.png)](assets/shot.png)"), ["assets/shot.png"]);

// Reference definitions.
assert.deepEqual(
	relativeLinkTargets("Read [the guide][guide].\n\n[guide]: docs/guide.md\n[site]: <https://x.y>"),
	[{ line: 3, target: "docs/guide.md" }],
);

// HTML anchors, while HTML images stay allowed.
assert.deepEqual(
	targets(
		'<a href="docs/guide.md">guide</a> <A HREF=\'https://x.y\'>site</A> <img src="assets/x.png">',
	),
	["docs/guide.md"],
);

// Code is not a link.
assert.deepEqual(
	relativeLinkTargets(
		"Use `[text](docs/x.md)` inline.\n\n```md\n[text](docs/y.md)\n```\n\n[real](docs/z.md)",
	),
	[{ line: 7, target: "docs/z.md" }],
);

process.stdout.write("README link guard tests passed.\n");
