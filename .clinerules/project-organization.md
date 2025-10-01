## Brief overview
Project-specific guidelines for organizing files and managing project structure, particularly for Signal K plugins and renaming operations.

## File organization
- Temporary files, non-critical files, and test-related files should be placed in a `.clinefiles` directory
- Keep the main project directory clean and focused on essential project files
- Separate working files from deliverable project structure

## Project renaming approach
- When renaming projects, conduct systematic searches across all files for references to old names
- Update package.json, README.md, and any configuration files first
- Check for references in comments, documentation, and repository URLs
- Verify script commands and release processes are updated with new naming

## Signal K plugin context
- This project deals with NMEA 2000 conversions and follows CanboatJS format standards
- Maintain compatibility with Signal K server plugin conventions
- Preserve existing PGN conversion functionality during structural changes
