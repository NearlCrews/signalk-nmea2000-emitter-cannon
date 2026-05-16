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
2. Add a new `### vX.Y.Z (YYYY/MM/DD) - <title>` entry at the top of
   `CHANGELOG.md`, with an `<a id="vXYZ"></a>` anchor line directly above the
   heading (digits only, no dots: `v1.5.8` -> `v158`).
3. **Overwrite the README "What's New" section.** It carries only the most
   recent release, never an accumulating list. Replace its body with a 2-4
   sentence prose summary sourced from the new CHANGELOG entry's lead
   paragraph, and update both trailing links:
   - the CHANGELOG anchor (`CHANGELOG.md#vXYZ`)
   - the GitHub release tag
     (`https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon/releases/tag/vX.Y.Z`)
   Update the `## What's New in vX.Y.Z` heading to the new version.
4. Run `npm run check`, `npm run typecheck`, `npm test`, and `npm run build`.
5. Commit, then run `npm run release`.
