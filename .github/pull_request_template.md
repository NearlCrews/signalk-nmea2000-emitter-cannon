# Pull Request

## Description

Please include a summary of the changes and the related issue. Please also include relevant motivation and context.

Fixes # (issue)

## Type of Change

Please delete options that are not relevant.

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] Dependency update

## Changes Made

- Change 1
- Change 2
- Change 3

## Testing

Please describe the tests that you ran to verify your changes:

- [ ] Unit tests (`npm test`)
- [ ] Integration tests with Signal K server
- [ ] Manual testing with marine hardware
- [ ] Build verification (`npm run build`)

## Test Configuration

- **Node.js Version**:
- **Signal K Version**:
- **Operating System**:
- **Test Hardware** (if applicable):

## PGN/Signal K Path Changes

If this PR affects specific PGNs or Signal K paths, list them here:

- **PGN**: [e.g. 129029]
- **Signal K Path**: [e.g. navigation.position]
- **Change**: [describe the change]

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
- [ ] I have checked that my code follows TypeScript best practices
- [ ] I have run `npm run lint` and fixed all issues
- [ ] I have run `npm run format` to format the code

## NMEA 2000 Compliance

For PGN-related changes:

- [ ] Follows CanboatJS message format
- [ ] Includes required metadata (`prio`, `pgn`, `dst`)
- [ ] Fields nested under `fields` object
- [ ] Uses camelCase for field names
- [ ] Handles null/undefined values
- [ ] Aligns with Garmin specifications (if applicable)
- [ ] Tested with CanboatJS encoder/decoder

## Breaking Changes

If this PR introduces breaking changes, describe them here and provide migration instructions:

## Screenshots/Videos

If applicable, add screenshots or videos to help explain your changes.

## Additional Notes

Add any other context about the pull request here.

## Attribution

This project builds upon [signalk-to-nmea2000](https://github.com/SignalK/signalk-to-nmea2000). If your changes are based on or inspired by work from that project, please acknowledge it here.