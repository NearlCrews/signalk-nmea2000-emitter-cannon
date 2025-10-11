# Building SignalK Plugins with AI Assistance (Claude/Roo Code)

This document explains how the **signalk-nmea2000-emitter-cannon** plugin was developed entirely using AI-assisted development tools (Claude, Roo Code), and how you can use similar methods to build your own SignalK plugins.

## Table of Contents

- [Overview](#overview)
- [Development Philosophy](#development-philosophy)
- [Tools Used](#tools-used)
- [Development Workflow](#development-workflow)
- [Key Patterns for AI-Assisted Development](#key-patterns-for-ai-assisted-development)
- [Project Structure](#project-structure)
- [Effective Prompting Strategies](#effective-prompting-strategies)
- [Common Tasks and Prompts](#common-tasks-and-prompts)
- [Best Practices](#best-practices)
- [Lessons Learned](#lessons-learned)

---

## Overview

This SignalK NMEA2000 plugin was **entirely built using AI assistance**, specifically:
- **Claude** (Anthropic's AI assistant)
- **Roo Code** (VS Code extension for Claude integration)

The project demonstrates how modern AI tools can effectively:
- Convert JavaScript to TypeScript with strict type safety
- Implement complex protocol conversions (Signal K ↔ NMEA 2000)
- Maintain production-quality code with zero errors/warnings
- Handle 74 conversion modules with 92% Garmin PGN coverage
- Create comprehensive test suites and documentation

---

## Development Philosophy

### Core Principles

1. **Iterative Development**: Break complex tasks into manageable steps
2. **Test-Driven**: Verify each change with builds and tests
3. **Type Safety First**: Leverage TypeScript for robust code
4. **Clear Communication**: Provide context and specific requirements
5. **Verification**: Always verify AI-generated code works correctly

### Why AI-Assisted Development Works Well for SignalK Plugins

- **Protocol Complexity**: NMEA 2000 has intricate specifications that benefit from AI's pattern recognition
- **Type Systems**: AI excels at creating and maintaining TypeScript type definitions
- **Repetitive Patterns**: Many conversion modules follow similar structures
- **Documentation**: AI can analyze code and generate accurate documentation
- **Modernization**: Converting legacy code to modern standards is AI's strength

---

## Tools Used

### 1. Claude (AI Assistant)

**Purpose**: Core development partner for:
- Code generation and refactoring
- Problem-solving and debugging
- Architecture decisions
- Documentation creation

**Model Used**: Claude Sonnet 4.5 (latest as of development)

### 2. Roo Code (VS Code Extension)

**Purpose**: Seamless IDE integration providing:
- Direct file editing capabilities
- Terminal command execution
- Multi-file context awareness
- Real-time code verification

**Key Features Used**:
- `read_file`: Analyze existing code
- `write_to_file`: Create new files
- `apply_diff`: Surgical code edits
- `execute_command`: Run builds/tests
- `list_files`: Explore project structure

### 3. Supporting Tools

- **TypeScript 5.9+**: Type safety and modern JavaScript features
- **Biome 2.2.5**: Fast linting and formatting
- **Vitest 3.2.4**: Modern testing framework
- **esbuild 0.25.10**: Blazing fast builds
- **Git**: Version control for tracking changes

---

## Development Workflow

### Phase 1: Project Analysis and Planning

**Initial Prompt Example**:
```
Analyze this SignalK plugin project. I want to:
1. Convert from JavaScript to TypeScript
2. Modernize dependencies (RxJS, es-toolkit)
3. Maintain 100% functionality
4. Add comprehensive type safety

Start by reading the project structure and key files.
```

**AI Actions**:
- Reads project structure recursively
- Analyzes package.json for dependencies
- Reviews existing code patterns
- Identifies conversion patterns
- Proposes modernization strategy

### Phase 2: Incremental Implementation

**Conversion Workflow**:
```
1. Convert core types first (types/index.ts, types/signalk.ts)
2. Convert utility functions (utils/)
3. Convert conversion modules one-by-one (src/conversions/)
4. Update main plugin entry point (src/index.ts)
5. Verify builds and tests after each step
```

**Example Prompt for Module Conversion**:
```
Convert src/conversions/wind.ts from JavaScript to TypeScript:
- Add proper type imports from types/index.ts
- Ensure strict type safety (no 'any' types)
- Maintain existing test cases
- Follow the ConversionModule interface pattern
```

### Phase 3: Testing and Verification

**After Each Change**:
```bash
npm run build      # Verify compilation
npm test           # Run test suite
npm run typecheck  # TypeScript validation
npm run check      # Linting
```

**Continuous Verification Prompt**:
```
After making those changes:
1. Run npm run build and show results
2. Run npm test and verify all tests pass
3. Run npm run typecheck to confirm no type errors
4. If any issues, fix them before proceeding
```

### Phase 4: Refinement and Documentation

**Documentation Generation**:
```
Update README.md to reflect:
- New TypeScript architecture
- Modern dependency stack
- Complete PGN coverage list
- Development workflow
- Contributing guidelines
```

---

## Key Patterns for AI-Assisted Development

### 1. Provide Context First

**Bad Prompt**:
```
Fix the wind conversion module
```

**Good Prompt**:
```
Looking at src/conversions/wind.ts, I need to:
1. Convert from JavaScript to TypeScript
2. Add types from types/index.ts
3. Ensure the callback function returns N2KMessage[]
4. Keep existing test cases working
5. Handle null/undefined values safely

Current file uses BaconJS, convert to RxJS patterns where needed.
```

### 2. Break Down Complex Tasks

Instead of: "Convert entire project to TypeScript"

Do:
```
Step 1: Create type definitions for NMEA2000 messages
Step 2: Create type definitions for SignalK data structures
Step 3: Convert utility functions with new types
Step 4: Convert conversion modules incrementally
Step 5: Update plugin manager and entry point
```

### 3. Specify Verification Steps

```
After implementing the battery conversion:
1. Verify it compiles without errors
2. Run the test suite
3. Check that PGN 127506 and 127508 are correctly formatted
4. Ensure instance ID mapping works correctly
```

### 4. Reference Existing Patterns

```
Convert the temperature conversion module following the same pattern
as the depth conversion in src/conversions/depth.ts:
- Use createConversion factory pattern
- Include enabled/resend configuration
- Add source filtering support
- Maintain test case structure
```

---

## Project Structure

### Organized for AI Navigation

```
signalk-nmea2000-emitter-cannon/
├── src/
│   ├── index.ts                 # Plugin entry point
│   ├── plugin-manager.ts        # Core plugin logic
│   ├── schema.ts                # Configuration schema
│   ├── types/                   # Type definitions
│   │   ├── index.ts            # Type exports
│   │   ├── signalk.ts          # SignalK types
│   │   ├── nmea2000.ts         # NMEA2000 types
│   │   └── plugin.ts           # Plugin types
│   ├── utils/                   # Utility functions
│   │   ├── pathUtils.ts        # Path helpers
│   │   └── messageUtils.ts     # Message helpers
│   ├── conversions/             # PGN conversions
│   │   ├── index.ts            # Module loader
│   │   ├── wind.ts             # Wind conversion
│   │   ├── depth.ts            # Depth conversion
│   │   └── [74 modules...]     # Other conversions
│   └── test/
│       └── index.test.ts        # Test suite
├── package.json                 # Dependencies & scripts
├── tsconfig.json               # TypeScript config
├── vitest.config.ts            # Test config
├── biome.json                  # Linter config
├── README.md                   # User documentation
├── CHANGELOG.md                # Version history
└── DEVELOPMENT.md              # This file
```

**Why This Structure Works for AI**:
- Clear separation of concerns
- Predictable file locations
- Consistent naming patterns
- Easy to describe relationships
- Modular conversion system

---

## Effective Prompting Strategies

### Strategy 1: Contextual Code Reading

**When to use**: Starting a new task or understanding existing code

**Example**:
```
Read these files together to understand the conversion system:
- src/types/index.ts
- src/conversions/wind.ts
- src/conversions/depth.ts
- src/plugin-manager.ts

Explain how conversion modules are loaded and executed.
```

### Strategy 2: Diff-Based Editing

**When to use**: Making targeted changes to existing files

**Example**:
```
In src/conversions/battery.ts, update the callback function:
- Change from BaconJS stream handling to RxJS
- Add proper error handling for missing battery instances
- Ensure return type is N2KMessage[]
- Keep test cases unchanged
```

### Strategy 3: Pattern Replication

**When to use**: Creating similar modules or features

**Example**:
```
Create src/conversions/gnssData.ts following the pattern from gps.ts:
- Support PGN 129539 (GNSS DOPs)
- Include horizontalDilution, verticalDilution, timeDilution
- Add mode field (enum: no fix, 2D, 3D)
- Create test cases with realistic values
```

### Strategy 4: Incremental Validation

**When to use**: Complex changes requiring verification

**Example**:
```
Update package.json to add icon support:
1. Add assets/icons/icon-72x72.png to files array
2. Update signalk.appIcon path
3. Verify package.json is valid JSON
4. Run npm install to test
5. Check build still works
```

### Strategy 5: Specification Alignment

**When to use**: Implementing protocol requirements

**Example**:
```
Review src/conversions/cogSOG.ts for Garmin spec compliance:
- Verify PGN 129026 format
- Check that SID field is included (value 87)
- Confirm priority is 2
- Ensure COG is in radians
- Verify SOG is in m/s
- Compare against Garmin PGN specification documentation
```

---

## Common Tasks and Prompts

### Task: Create a New Conversion Module

**Prompt Template**:
```
Create a new conversion module for [PGN NAME] (PGN [NUMBER]):

Requirements:
- Signal K path: [path.to.data]
- NMEA2000 fields: [field1, field2, ...]
- Units: [source units] → [target units]
- Priority: [0-7]
- Include test cases with realistic values

Follow the pattern in src/conversions/[similar-module].ts
```

**Example**:
```
Create a new conversion module for Atmospheric Pressure (PGN 130314):

Requirements:
- Signal K path: environment.outside.pressure
- NMEA2000 fields: pressure (in Pascals)
- Units: Pascals (no conversion needed)
- Priority: 5
- Include test cases: 101325 Pa (sea level), 90000 Pa (high altitude)

Follow the pattern in src/conversions/pressure.ts
```

### Task: Update Dependencies

**Prompt**:
```
Update all npm packages to latest versions:
1. Run npm outdated to see available updates
2. Update package.json with latest versions
3. Run npm install
4. Verify build works: npm run build
5. Verify tests pass: npm test
6. Fix any breaking changes in code
```

### Task: Add Configuration Options

**Prompt**:
```
Add source filtering to [CONVERSION_NAME] in src/schema.ts:

For each Signal K path used by the conversion:
1. Add a source field with format: [pathwithoutdots]
2. Title: "Source for [path]"
3. Description: "Use data only from this source (leave blank to ignore source)"
4. Type: string

Example from DEPTH conversion.
```

### Task: Fix Type Errors

**Prompt**:
```
Run npm run typecheck and fix all type errors:
1. Show the error output
2. For each error, explain the issue
3. Fix it with proper types (no 'any')
4. Verify fix with another typecheck
5. Ensure tests still pass
```

### Task: Optimize Build Output

**Prompt**:
```
Optimize the esbuild configuration in package.json:
- Review current bundle size
- Ensure proper externals (canboatjs, rxjs, es-toolkit)
- Check tree-shaking is working
- Verify minification is enabled
- Compare before/after bundle sizes
```

---

## Best Practices

### 1. Always Verify AI Output

**Never blindly trust generated code**:
```bash
# Always run after AI changes:
npm run build      # Compilation check
npm test           # Functionality check
npm run typecheck  # Type safety check
npm run check      # Code quality check
```

### 2. Use Version Control

**Commit after successful changes**:
```bash
git add .
git commit -m "feat: add [feature] with AI assistance"
```

**Benefits**:
- Easy rollback if AI makes mistakes
- Track what worked vs. what didn't
- Clear history of development progression

### 3. Provide Examples

**When asking for new code, show existing examples**:
```
Create a new conversion module for [FEATURE], following this pattern:

[paste existing similar module]

Key differences:
- Use PGN [NUMBER] instead of [OLD_NUMBER]
- Add field [NEW_FIELD]
- Change units from [OLD] to [NEW]
```

### 4. Iterate on Failures

**If AI produces incorrect code**:
```
The previous conversion has issues:
1. [Specific error from build/test]
2. [What's wrong with the output]
3. [What the correct behavior should be]

Please fix these specific issues.
```

### 5. Document Decisions

**Keep track of architectural choices**:
```
Update DEVELOPMENT.md to document why we chose:
- RxJS over BaconJS (better TypeScript support)
- Biome over ESLint (faster, simpler)
- Vitest over Jest (native ESM support)
- esbuild over webpack (build speed)
```

---

## Lessons Learned

### What Works Well

✅ **Type Conversions**: AI excels at JavaScript → TypeScript conversion
✅ **Pattern Replication**: Once a pattern exists, AI can replicate it consistently
✅ **Documentation**: AI generates excellent docs from code
✅ **Refactoring**: Complex refactors are handled well with clear instructions
✅ **Testing**: AI creates comprehensive test cases when given examples
✅ **Dependencies**: AI keeps track of compatibility and upgrade paths

### What Requires Careful Human Review

⚠️ **Protocol Specifications**: Verify AI's interpretation of NMEA2000/SignalK specs
⚠️ **Edge Cases**: Double-check null/undefined handling
⚠️ **Performance**: Benchmark critical paths (AI may prioritize correctness over speed)
⚠️ **Security**: Review any external inputs or API integrations
⚠️ **Domain Logic**: Verify marine-specific calculations (units, conversions)

### Common Pitfalls to Avoid

❌ **Vague Prompts**: "Make it better" → Be specific about what needs improvement
❌ **Too Large Scope**: "Rewrite everything" → Break into smaller tasks
❌ **No Verification**: Trust but verify all AI output with tests
❌ **Ignoring Errors**: Fix compilation/test errors immediately
❌ **Missing Context**: Provide relevant files and existing patterns

---

## Example: Building a SignalK Plugin from Scratch

### Step-by-Step with AI Assistance

#### Step 1: Project Setup

**Prompt**:
```
Create a new SignalK plugin project structure for [PLUGIN_NAME]:

1. Initialize package.json with:
   - name: signalk-[plugin-name]
   - version: 1.0.0
   - type: "module" (ESM)
   - engines: node >=20

2. Add dependencies:
   - TypeScript 5.9+
   - esbuild (build)
   - vitest (testing)
   - biome (linting)
   - @canboat/canboatjs (if NMEA2000)

3. Create directory structure:
   src/
   ├── index.ts
   ├── types/
   ├── conversions/ (if needed)
   └── test/

4. Add build scripts to package.json
5. Create tsconfig.json for strict TypeScript
6. Create vitest.config.ts
7. Create biome.json for linting
```

#### Step 2: Core Plugin Implementation

**Prompt**:
```
Implement the main plugin entry point in src/index.ts:

Requirements:
- Export a factory function: (app: SignalKApp) => SignalKPlugin
- Plugin ID: signalk-[name]
- Include start() and stop() functions
- Add schema() for configuration UI
- Handle subscription management
- Include proper TypeScript types

Reference SignalK plugin interface specification.
```

#### Step 3: Add Conversion Logic

**Prompt**:
```
Create conversion modules in src/conversions/:

For each Signal K path you want to monitor:
1. Create a conversion module file
2. Implement ConversionModule interface
3. Add callback for data transformation
4. Include test cases
5. Register in src/conversions/index.ts

Example: Wind data (environment.wind.angleApparent, speedApparent)
to NMEA2000 PGN 130306
```

#### Step 4: Configuration Schema

**Prompt**:
```
Create src/schema.ts with JSON Schema for plugin configuration:

For each conversion:
- enabled: boolean (default false)
- resend: number (periodic resend interval)
- source filters: string fields for each Signal K path

Generate schema following SignalK plugin configuration standards.
```

#### Step 5: Testing

**Prompt**:
```
Create comprehensive test suite in src/test/:

1. Test each conversion module individually
2. Verify NMEA2000 message format with canboatjs
3. Test configuration parsing
4. Test edge cases (null, undefined, invalid values)
5. Verify type safety

Add test command to package.json: "test": "vitest --run"
```

#### Step 6: Documentation

**Prompt**:
```
Generate README.md with:
- Project description
- Installation instructions (AppStore + manual)
- Configuration guide
- Supported PGNs/conversions
- Development setup
- Contributing guidelines
- License (ISC)
- Acknowledgments

Generate CHANGELOG.md with:
- v1.0.0 initial release notes
- Feature list
- Technical details
```

#### Step 7: Publishing Preparation

**Prompt**:
```
Prepare for npm publishing:

1. Add SignalK plugin metadata to package.json:
   - signalk.appIcon: path to icon
   - signalk.displayName: human-readable name
   - keywords: signalk-node-server-plugin, etc.

2. Create assets/icons/icon-72x72.png (or reference existing)

3. Update files array in package.json:
   ["dist/", "assets/", "README.md", "LICENSE", "CHANGELOG.md"]

4. Add prepack script: "npm run build"

5. Verify with: npm pack
```

---

## Advanced Techniques

### Multi-Step Refactoring

**For complex changes spanning multiple files**:

```
I want to refactor the plugin manager to use a more modular architecture:

Phase 1: Analysis
- Review current plugin-manager.ts structure
- Identify responsibilities that should be separated
- Propose new module structure

Phase 2: Planning
- Create new module files (but don't implement yet)
- Define interfaces for each module
- Show how modules will interact

Phase 3: Implementation
- Implement modules one at a time
- Update plugin-manager.ts incrementally
- Verify tests pass after each module

Phase 4: Cleanup
- Remove old code
- Update documentation
- Final verification
```

### Dependency Migration

**Example: Replacing Lodash with es-toolkit**:

```
Migrate from lodash to es-toolkit across the project:

Step 1: Audit current lodash usage
- Find all lodash imports
- List functions used
- Check es-toolkit equivalents

Step 2: Update dependencies
- Remove lodash from package.json
- Add es-toolkit
- Run npm install

Step 3: Update imports (file by file)
- Replace lodash imports with es-toolkit
- Update function calls if API differs
- Verify tests pass for each file

Step 4: Final verification
- Run full build
- Run full test suite
- Check bundle size reduction
```

### Performance Optimization

**Systematic performance improvement**:

```
Optimize plugin performance:

1. Profile current performance
   - Measure startup time
   - Check memory usage
   - Identify bottlenecks

2. Optimize hot paths
   - Review conversion callbacks
   - Minimize object creation
   - Cache computed values

3. Optimize build
   - Review esbuild settings
   - Check bundle size
   - Verify tree-shaking

4. Benchmark changes
   - Compare before/after metrics
   - Ensure no regressions
```

---

## Conclusion

Building SignalK plugins with AI assistance (Claude/Roo Code) is highly effective when:

1. **You provide clear, specific instructions**
2. **You verify all AI-generated code**
3. **You break complex tasks into smaller steps**
4. **You maintain good project structure**
5. **You leverage AI's strengths** (patterns, types, documentation)

This plugin demonstrates that AI can handle complex protocol implementations, maintain production-quality code, and accelerate development significantly when properly guided.

### Key Takeaways

- **AI as a Development Partner**: Not replacement, but force multiplier
- **Iterative Process**: Small steps with verification
- **Type Safety**: TypeScript + AI = Robust code
- **Testing**: AI excels at comprehensive test generation
- **Documentation**: AI produces excellent docs from code

### Getting Started

To build your own SignalK plugin with AI assistance:

1. **Start Simple**: Begin with basic plugin structure
2. **Provide Examples**: Show AI existing plugins as reference
3. **Iterate**: Build one feature at a time
4. **Verify**: Test everything the AI generates
5. **Learn**: Understand the patterns AI uses

**Happy coding with AI assistance!** 🚀

---

## Resources

- **SignalK Documentation**: https://signalk.org/
- **NMEA 2000 PGN List**: https://www.nmea.org/content/STANDARDS/NMEA_2000
- **Canboat Project**: https://github.com/canboat/canboat
- **Claude AI**: https://claude.ai/
- **Roo Code Extension**: Search "Roo Code" in VS Code marketplace
- **This Plugin**: https://github.com/NearlCrews/signalk-nmea2000-emitter-cannon

---

*This document was created with AI assistance to demonstrate the very techniques it describes.*