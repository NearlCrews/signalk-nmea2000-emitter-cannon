# Releasing

Maintainer reference for cutting a release of `signalk-nmea2000-emitter-cannon`.

## Process

`npm run release` (run locally) tags the current `package.json` version, pushes
the tag and `main`, and creates a GitHub release with auto-generated notes. The
`Publish to npm` workflow then fires on the `release: published` event, runs
typecheck and tests, verifies the tag matches `package.json`, and publishes to
npm with sigstore provenance.

The workflow also supports manual `workflow_dispatch` with a `tag` input from
the Actions tab, useful for backfilling a release that was created before the
workflow existed. It requires an `NPM_TOKEN` repo secret (npm Automation token,
or Granular token with publish + read on this package).

## Checklist

Before running `npm run release`:

1. Bump `version` in `package.json`.
2. Add a new `## [X.Y.Z] - YYYY-MM-DD` entry at the top of `CHANGELOG.md`
   (below `## [Unreleased]`), with an `<a id="vXYZ"></a>` anchor line directly
   above the heading (digits only, no dots: `1.5.8` -> `v158`).
3. **Overwrite the README "What's new" section.** It carries only the most
   recent release, never an accumulating list. Replace its body with 3 to 5
   bolded bullets sourced from the new CHANGELOG entry, then a closing line
   that links the CHANGELOG anchor (`CHANGELOG.md#vXYZ`) and the full release
   history (`CHANGELOG.md`). Update the `## What's new in X.Y.Z` heading to
   the new version.
4. Run `npm run check`, `npm run typecheck`, `npm test`, and `npm run build`.
5. Commit, then run `npm run release`.

## Troubleshooting

- **`Publish to npm` fails at the publish step with `npm error code E404 ... Not Found - PUT`.**
  On `npm publish` an `E404` is npm's disguised authentication failure: the
  `NPM_TOKEN` secret is invalid, expired, or lacks publish rights on this
  package (an `npm publish` to a package that exists never legitimately 404s).
  Set a fresh npm Automation token, or a Granular token with publish + read on
  this package, with `printf '%s' '<token>' | gh secret set NPM_TOKEN`, then
  re-run the workflow from the Actions tab. To sanity-check a token without
  cutting a new version, dispatch the workflow against an already-published tag
  (`gh workflow run publish.yml -f tag=vX.Y.Z`): a healthy token gets past auth
  and stops at `E403 ... cannot publish over the previously published versions`,
  which confirms the credential works.
