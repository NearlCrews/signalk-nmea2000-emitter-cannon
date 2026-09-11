# Contributing

Thanks for your interest in contributing to NMEA 2000 Emitter Cannon.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

## Reporting bugs

Check existing issues first to avoid duplicates, then open a bug report with:

- A clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node.js version, Signal K version, OS)
- Relevant log output

## Suggesting enhancements

Open a feature request issue describing the proposed feature, the use case it
serves, and any implementation ideas you have.

## Pull requests

1. Fork the repository and create a feature branch from `main`.
2. Follow the [development guide](../docs/development.md) for setup, build, and
   test commands.
3. Make focused commits with clear messages (see below).
4. Add tests for any new functionality and keep the existing suite green.
5. Run `npm run verify` before pushing.
6. Update documentation (`README.md`, `CHANGELOG.md`, `docs/`) as needed.
7. Open a pull request with a clear description of the change.

## Code style

- Strict TypeScript: no `any` types; validate unknown inputs with type guards.
- Formatting is handled by Biome (`npm run format`); the pre-commit hook runs
  the repository's formatting, lint, module-boundary, and dead-code gates.
- Use constants from `src/constants.ts` instead of magic numbers.
- Validate numeric input with `isValidNumber` / `toValidNumber` from
  `src/utils/validation.ts`; never use `typeof x === "number"` (it lets `NaN`
  through).
- Coerce `unknown`-typed thrown values with `errMessage()` from
  `src/utils/errorUtils.ts` before passing them to `app.error()`.
- Default to no comments. Add one only when the WHY is non-obvious (a hidden
  constraint, a subtle invariant, a workaround).

See [CLAUDE.md](../CLAUDE.md) for the full set of project conventions and
[docs/development.md](../docs/development.md) for the conversion-module
walkthrough and project structure.

## Toolchain notes

- `devDependencies` carries TypeScript twice on purpose. `@typescript/native`
  (`npm:typescript@^7`) is the compiler `npm run check` runs, while the bare
  `typescript` specifier resolves to `@typescript/typescript6`, the TypeScript 6
  compiler API that typescript-eslint, knip, and dependency-cruiser load,
  because typescript-eslint does not yet support TypeScript 7. The shim pulls in
  the real TypeScript 6 compiler as `@typescript/old`, which declares a `tsc` bin
  of its own, so `node_modules/.bin/tsc` points at whichever of the two npm
  linked last; `npm run check` therefore launches the TypeScript 7 compiler by
  path (`npm run tsc7`) instead of trusting that link. `npm run check:ts6`
  type-checks with the shim's `tsc6` so the two compilers cannot drift silently;
  `npm run verify:fast` runs both. Collapse back to one `typescript` entry once
  typescript-eslint supports TypeScript 7. Dependabot does not bump aliased
  ranges, so review both entries by hand when updating dependencies.
- `@types/node` stays on the major of the `engines.node` floor (22), even when a
  newer major is published, so the types describe the lowest runtime the plugin
  advertises. `npm run package:check` enforces this.

## Architecture rule

One plugin, modular TypeScript files under `src/`, never split into multiple
npm packages. New functionality is a new module (for example a new conversion
under `src/conversions/`), not a new package or a monorepo split.

## Commit messages

Use conventional-commit prefixes that match the actual diff scope:

```text
feat: add support for PGN 12345 (feature description)
fix: correct temperature conversion in PGN 130312
docs: update installation instructions
test: add tests for wind data conversion
chore: update dependencies
```

## NMEA 2000 compliance

All PGN conversions must follow the CanboatJS message format: required `prio`,
`pgn`, `dst` metadata, data fields nested under `fields` with camelCase names,
proper null/undefined handling, and alignment with Garmin PGN specifications
where applicable.

## License and attribution

By contributing, you agree your contributions are licensed under the Apache 2.0
License that covers this project. This project builds on
[signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) by Scott
Bender and the Signal K community; please maintain proper attribution.
