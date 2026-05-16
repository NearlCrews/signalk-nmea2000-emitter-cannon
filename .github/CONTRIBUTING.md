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
5. Run `npm run check`, `npm run typecheck`, and `npm test` before pushing.
6. Update documentation (`README.md`, `CHANGELOG.md`, `docs/`) as needed.
7. Open a pull request with a clear description of the change.

## Code style

- Strict TypeScript: no `any` types; validate unknown inputs with type guards.
- Formatting is handled by Biome (`npm run format`); pre-commit hooks run
  `biome check` on staged files.
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

## Commit messages

Use conventional-commit prefixes that match the actual diff scope:

```
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
