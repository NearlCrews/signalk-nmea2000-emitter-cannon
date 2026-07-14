# Releasing

Maintainer reference for cutting a release of `signalk-nmea2000-emitter-cannon`.

## Process

`npm run release` (run locally) verifies a clean `main` checkout tracking
`origin/main`, checks that it is not behind, tags the current `package.json`
version, atomically pushes only `main` and that tag, and creates a GitHub
release with auto-generated notes. The `Publish to npm` workflow then fires on
the `release: published` event, runs typecheck and tests, verifies the tag
matches `package.json`, and publishes to npm with sigstore provenance.

The workflow also supports manual `workflow_dispatch` with a `tag` input from
the Actions tab, useful for backfilling a release that was created before the
workflow existed. It requires an `NPM_TOKEN` repo secret (npm Automation token,
or Granular token with publish + read on this package).

## Checklist

Before running `npm run release`:

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
4. Run `npm ci` to prove the lockfile installs from a clean dependency tree.
5. Run `npm run check`, `npm run typecheck`, `npm test`,
   `npm run test:coverage`, and `npm run build`.
6. Run `npm outdated --long`, `npm audit`, `npm audit --omit=dev`,
   `npm exec --yes --package=knip@latest -- knip`, and
   `npm pack --dry-run --json`. Resolve unexpected output before publishing.
   Also ask npm's resolver whether the installed tree and lockfile have any
   remaining updates under their declared parent ranges:

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
7. Commit, run `npm run release -- --check` to exercise the release preflight,
   then run `npm run release`.

After `npm run release`:

1. Confirm `gh release view vX.Y.Z` reports the expected tag and release notes.
2. Find the release commit's workflow runs with
   `gh run list --commit "$(git rev-list -n 1 vX.Y.Z)" --limit 30` and watch the
   Publish to npm, CI, and SignalK Plugin CI runs to completion.
3. Confirm `npm view signalk-nmea2000-emitter-cannon version` and
   `npm view signalk-nmea2000-emitter-cannon dist-tags.latest` both report the
   released version.
4. Confirm SignalK Plugin CI ran on the tagged commit. The plugin registry uses
   that exact run as an app-store scoring input.

## Troubleshooting

- **`Publish to npm` fails at the publish step with `npm error code E404 ... Not Found - PUT`.**
  On `npm publish` an `E404` is npm's disguised authentication failure: the
  `NPM_TOKEN` secret is invalid, expired, or lacks publish rights on this
  package (an `npm publish` to a package that exists never legitimately 404s).
  Set a fresh npm Automation token, or a Granular token with publish + read on
  this package, by running `gh secret set NPM_TOKEN` and pasting the value at
  its hidden prompt. Never put the token directly on the command line. Then
  re-run the workflow from the Actions tab. To sanity-check a token without
  cutting a new version, dispatch the workflow against an already-published tag
  (`gh workflow run publish.yml -f tag=vX.Y.Z`): a healthy token gets past auth
  and stops at `E403 ... cannot publish over the previously published versions`,
  which confirms the credential works.
