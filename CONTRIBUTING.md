# Contributing to SD-Parsers

Thank you for your interest in contributing to sd-parsers! This guide will help you get started with development and contributing to the project.

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn package manager
- Git

### Getting Started

1. **Fork and clone the repository:**
```bash
git clone https://github.com/your-username/sd-parsers.git
cd sd-parsers
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build the project:**
```bash
npm run build
```

4. **Run tests:**
```bash
npm test
```

5. **Start development with watch mode:**
```bash
npm run dev
```

## Development Workflow

### Project Structure
```
src/
├── data/           # Data models and interfaces
├── extractors/     # Metadata extraction utilities
├── parsers/        # Parser implementations
└── index.ts        # Main exports

tests/
├── resources/      # Test images and fixtures
└── *.test.ts      # Test files
```

### Building and Testing
- **`npm run build`** - Compile TypeScript to JavaScript
- **`npm run dev`** - Watch mode for development with auto-compilation
- **`npm test`** - Run all tests
- **`npm test -- --watch`** - Run tests in watch mode
- **`npm test -- --coverage`** - Run tests with coverage report

### Code Quality Standards
- **TypeScript**: Follow TypeScript best practices and strict mode
- **Naming**: Use meaningful, descriptive names for variables and functions
- **Documentation**: Add JSDoc comments for all public APIs
- **Testing**: Ensure all new code has corresponding tests
- **Formatting**: Code will be checked for style consistency

## Contributing Guidelines

### Adding New Parsers

To add support for a new image generator:

1. **Create parser file** in `src/parsers/`
2. **Extend the Parser base class:**
```typescript
import { Parser } from './parser';
import { Generators, PromptInfo } from '../data';

export class MyNewParser extends Parser {
  public readonly generator = Generators.MY_NEW_GENERATOR;

  async parse(parameters: Record<string, any>): Promise<PromptInfo> {
    // Parse the parameters and extract metadata
    // Return structured PromptInfo object
    return {
      generator: this.generator,
      prompts: [], // Extract prompts
      models: [],  // Extract model information
      samplers: [], // Extract sampler settings
      metadata: parameters,
      rawParameters: parameters
    };
  }
}
```

3. **Add to parser exports** in `src/parsers/index.ts`
4. **Add to managed parsers** in `src/parserManager.ts`
5. **Write comprehensive tests** in `tests/`
6. **Update documentation** including README and API docs

### Adding New Extractors

To enhance metadata extraction capabilities:

1. **Add extractor functions** in `src/extractors/extractors.ts`
2. **Update eagerness levels** as appropriate
3. **Test with various image types**
4. **Document any limitations or requirements**

### Testing Requirements

- **Unit tests**: Test individual parser functionality
- **Integration tests**: Test with real image files from `tests/resources/`
- **Error handling**: Test edge cases and error conditions
- **Type safety**: Ensure TypeScript types are correct
- **Coverage**: Aim for high test coverage of new code

Example test structure:
```typescript
describe('MyNewParser', () => {
  it('should parse valid metadata', async () => {
    const parser = new MyNewParser();
    const result = await parser.parse(mockParameters);
    expect(result).toBeDefined();
    expect(result.generator).toBe(Generators.MY_NEW_GENERATOR);
  });

  it('should handle invalid input gracefully', async () => {
    const parser = new MyNewParser();
    const result = await parser.parse({});
    expect(result).toBeNull();
  });
});
```

## Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** following the coding standards
3. **Add or update tests** for your changes
4. **Update documentation** as needed
5. **Ensure all tests pass** (`npm test`)
6. **Build successfully** (`npm run build`)
7. **Submit pull request** with clear description

### Pull Request Guidelines

- **Clear title**: Describe what the PR does
- **Detailed description**: Explain the changes and why they're needed
- **Link issues**: Reference any related issues
- **Test results**: Confirm tests pass locally
- **Breaking changes**: Clearly document any breaking changes

## Code of Conduct

- **Be respectful**: Treat all contributors with respect
- **Be constructive**: Provide helpful feedback and suggestions
- **Be patient**: Remember that everyone has different experience levels
- **Be inclusive**: Welcome contributors from all backgrounds

## Getting Help

- **Issues**: Open an issue for bugs, questions, or feature requests
- **Discussions**: Use GitHub Discussions for general questions
- **Documentation**: Check the README and API documentation first

## Release Process

Releases follow semantic versioning:
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backwards compatible
- **Patch** (0.0.1): Bug fixes, backwards compatible

Thank you for contributing to sd-parsers! 🚀
