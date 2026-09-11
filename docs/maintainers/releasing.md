# Releasing

Maintainer reference for cutting a release of `signalk-nmea2000-emitter-cannon`.

## Process

`npm run release` (run locally) verifies a clean `main` checkout tracking
`origin/main`, checks that it is not behind, tags the current `package.json`
version, atomically pushes only `main` and that tag, and creates a GitHub
release with auto-generated notes. The `Publish to npm` workflow then fires on
the `release: published` event. It verifies the tag and main-branch ancestry,
runs the complete release gate, packs one immutable tarball, transfers that
artifact to a separate least-privilege publish job, and publishes to npm with
sigstore provenance. The tarball records the tagged source commit as
`gitHead`, and the publish job verifies npm reports that exact commit after
publication. Publishing requires an `NPM_TOKEN` repository secret with publish
access to this package.

## Checklist

Before running `npm run release`, obtain explicit approval to create the tag,
GitHub release, and npm publication. Then:

1. Run `npm version X.Y.Z --no-git-tag-version`. This keeps `package.json`,
   the top-level lockfile version, and the lockfile root package aligned without
   creating the release tag early.
2. Add a new `## [X.Y.Z] - YYYY-MM-DD` entry at the top of `CHANGELOG.md`
   (below `## [Unreleased]`), with an `<a id="vXYZ"></a>` anchor line directly
   above the heading (digits only, no dots: `1.5.8` -> `v158`).
3. **Overwrite the README "What's new" section.** It carries only the most
   recent release, never an accumulating list. Replace its body with 3 to 5
   bolded bullets sourced from the new CHANGELOG entry, then a closing line
   that links the CHANGELOG anchor (`CHANGELOG.md#vXYZ`) and the full release
   history (`CHANGELOG.md`). Update the `## What's new in X.Y.Z` heading to
   the new version.
4. If the configuration panel changed materially, run `npm run screenshots`.
   The command rebuilds the production panel, exercises it in Chromium, and
   regenerates the App Store images. Each is captured at a size hardcoded in
   `scripts/check-panel-browser.mjs`, so a capture is reproducible. Inspect
   every image before committing it.

   **A package auditor warning about screenshot dimensions is expected and is
   not a finding.** Do not resize the images or re-raise this each release. The
   App Store recommendation is 1280 by 800, and a per-file dimension check
   cannot tell the hero from a content shot:

   | Image | Size | Why |
   | --- | --- | --- |
   | `config-panel.png` | 1280 by 800 | The App Store hero, the first entry in `signalk.screenshots`. Held at exactly the recommendation so consumers and review tooling see the same composition on every capture. |
   | `environment-conversions.png` | 1393 by 1235 | Sized to its content, captured after the Environment category renders. |
   | `config-advisor.png` | 1405 by 1510 | Sized to its content, captured after the advisor's Review now button appears. |

   The hero already meets the recommendation. Cropping the other two to 1280 by
   800 would cut off the thing each screenshot exists to show, and all three are
   well under the 500 KB size guidance at 90, 175, and 181 KB.
5. Run `npm ci` to prove the lockfile installs from a clean dependency tree.
6. Run `npm run verify:release`. This covers formatting, linting, spelling,
   module boundaries, dead code, strict types, coverage, production builds,
   the panel runtime smoke test, the Chromium and WebKit browser check, bundle
   budgets, package contents, publint, and security audits. Runtime
   dependencies must have zero findings. The full dependency audit allowlist in
   `scripts/audit-policy.mjs` is empty, so it fails closed on every advisory;
   add an entry there only after reviewing the advisory, and remove it once the
   chain leaves the tree.
7. Run `npm outdated --long` and resolve unexpected output. A newer TypeScript
   or `@types/node` major is expected only when it is outside the typed-lint or
   supported-Node compatibility range. Also ask npm's resolver whether the
   installed tree and lockfile have updates within their declared ranges:

   ```bash
   set -o pipefail
   npm update --dry-run --json | node -e '
   let input = "";
   process.stdin.on("data", (chunk) => { input += chunk; });
   process.stdin.on("end", () => {
     const result = JSON.parse(input || "{}");
     const changes = ["added", "changed", "removed"]
       .reduce((total, key) => total + Number(result[key] || 0), 0);
     if (changes > 0) {
       console.error(JSON.stringify(result, null, 2));
       process.exitCode = 1;
     }
   });
   '
   ```

   This uses npm's own hoisting and range resolution, so shared transitive
   packages are not falsely reported as stale when one installed version is
   the resolver's optimal fit for multiple parent ranges.
8. Commit, run `npm run release -- --check` to exercise the release preflight,
   then run `npm run release`.

After `npm run release`:

1. Confirm `gh release view vX.Y.Z` reports the expected tag and release notes.
2. Find the release commit's workflow runs with
   `gh run list --commit "$(git rev-list -n 1 vX.Y.Z)" --limit 30` and watch the
   Publish to npm, CI, and SignalK Plugin CI runs to completion.
3. Confirm `npm view signalk-nmea2000-emitter-cannon version` and
   `npm view signalk-nmea2000-emitter-cannon dist-tags.latest` both report the
   released version.
4. Confirm `npm view signalk-nmea2000-emitter-cannon gitHead` reports the
   tagged commit.
5. Confirm SignalK Plugin CI ran on the tagged commit. The plugin registry uses
   that exact run as an app-store scoring input.

## Troubleshooting

- **`Publish to npm` fails at the publish step with `npm error code E404 ... Not Found - PUT`.**
  On `npm publish` an `E404` is npm's disguised authentication failure: the
  `NPM_TOKEN` secret is invalid, expired, or lacks publish rights on this
  package (an `npm publish` to a package that exists never legitimately 404s).
  Set a fresh npm Automation token, or a Granular token with publish + read on
  this package, by running `gh secret set NPM_TOKEN` and pasting the value at
  its hidden prompt. Never put the token directly on the command line. Then use
  `gh run rerun RUN_ID --failed` to retry the failed publish job against the
  already verified artifact.
