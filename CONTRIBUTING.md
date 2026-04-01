# Contributing to Signal K NMEA2000 Emitter Cannon

Thank you for your interest in contributing to Signal K NMEA2000 Emitter Cannon! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details** (Node.js version, Signal K version, OS)
- **Log output** if applicable

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title and description** of the proposed feature
- **Use case** explaining why this enhancement would be useful
- **Possible implementation** if you have ideas

### Pull Requests

1. **Fork the repository** and create your branch from `master`
2. **Follow the development setup** instructions below
3. **Make your changes** with clear, descriptive commits
4. **Add tests** for any new functionality
5. **Ensure all tests pass** (`npm test`)
6. **Run linting** (`npm run lint`) and fix any issues
7. **Update documentation** as needed
8. **Submit a pull request** with a clear description

## Development Setup

### Prerequisites

- Node.js 20 or higher
- npm or compatible package manager
- Git

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/signalk-nmea2000-emitter-cannon.git
cd signalk-nmea2000-emitter-cannon

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development with watch mode
npm run build:watch
```

### Project Structure

```
src/
├── index.ts              # Main plugin entry point
├── plugin-manager.ts     # Core plugin lifecycle management
├── schema.ts             # Configuration schema
├── constants.ts          # NMEA 2000 default values
├── types/                # TypeScript type definitions
├── utils/                # Utility functions (validation, smoothing, dates)
├── conversions/          # PGN conversion modules (46 modules)
└── test/                 # Test suites
.github/
└── workflows/
    └── ci.yml            # GitHub Actions CI pipeline
```

## Development Guidelines

### Code Style

- **TypeScript**: Use strict TypeScript with no `any` types
- **Formatting**: Code is automatically formatted with Biome
- **Naming**: Use descriptive variable and function names
- **Comments**: Add comments for complex logic
- **Constants**: Use values from `src/constants.ts` instead of magic numbers

Pre-commit hooks automatically run linting on staged files. To manually format:
```bash
npm run format
```

### Pre-commit Hooks

This project uses husky + lint-staged for automated code quality. After running `npm install`, pre-commit hooks will automatically:
- Run Biome check on staged TypeScript files
- Format staged JSON and Markdown files

### Adding New PGN Conversions

1. Create a new file in `src/conversions/`
2. Implement the `ConversionModule` interface
3. Include comprehensive test cases in the module
4. Follow the CanboatJS message format requirements
5. Add the module to `src/conversions/index.ts`

Example conversion module structure:

```typescript
import type { ConversionModule, N2KMessage } from '../types/index.js'

export default function createMyConversion(): ConversionModule {
  return {
    title: "My Conversion (PGN 12345)",
    optionKey: "MY_CONVERSION",
    keys: ["path.to.signalk.data"],
    callback: (value: unknown): N2KMessage[] => {
      if (typeof value !== 'number') return []
      
      return [{
        prio: 2,
        pgn: 12345,
        dst: 255,
        fields: {
          myField: value
        }
      }]
    },
    tests: [{
      input: [42],
      expected: [{
        prio: 2,
        pgn: 12345,
        dst: 255,
        fields: { myField: 42 }
      }]
    }]
  }
}
```

### Testing

- Write tests for all new functionality
- Ensure existing tests pass before submitting PR
- Use Vitest for testing framework
- Include edge cases and error conditions

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

### Commit Messages

Use clear and descriptive commit messages:

```
feat: add support for PGN 12345 (feature description)
fix: correct temperature conversion in PGN 130312
docs: update installation instructions
test: add tests for wind data conversion
chore: update dependencies
```

### Type Safety

- Maintain strict TypeScript compliance
- Use proper type definitions
- Avoid `any` types
- Validate unknown inputs with type guards

## NMEA 2000 Compliance

All PGN conversions must:
- Follow CanboatJS message format
- Include required metadata: `prio`, `pgn`, `dst`
- Nest data fields under `fields` object
- Use camelCase for field names
- Handle null/undefined values properly
- Align with Garmin PGN specifications where applicable

## Documentation

- Update README.md for user-facing changes
- Update inline code comments
- Keep CHANGELOG.md current
- Document breaking changes clearly

## Questions?

Feel free to:
- Open an issue for questions
- Join Signal K community discussions
- Contact maintainers

## License

By contributing, you agree that your contributions will be licensed under the same Apache 2.0 License that covers this project.

## Attribution

This project builds upon [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000) by Scott Bender and the Signal K community. Please maintain proper attribution when contributing.

---

Thank you for contributing to Signal K NMEA2000 Emitter Cannon! 🚢