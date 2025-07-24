# SD-Parsers Test Suite

This directory contains the comprehensive test suite for sd-parsers.

## Test Structure

### Unit Tests (`/unit`)
Tests for individual components in isolation:

- **`/unit/data/`** - Tests for data models and helper functions
  - `index.test.ts` - Data types, enums, and helper function tests

- **`/unit/parsers/`** - Tests for individual parser implementations  
  - `automatic1111.test.ts` - AUTOMATIC1111 parser tests
  - `fooocus.test.ts` - Fooocus parser tests
  - `newer-parsers.test.ts` - ComfyUI, InvokeAI, NovelAI parser tests

- **`/unit/extractors/`** - Tests for metadata extraction functions
  - `extractors.test.ts` - PNG/JPEG metadata extractor tests

- **`parserManager.test.ts`** - Core ParserManager functionality tests

### Integration Tests (`/integration`)
Tests that verify end-to-end functionality:

- **`image-parsing.test.ts`** - Real image parsing with test resources

### Test Resources (`/resources`)
Sample images and test data:

- **`/parsers/`** - Sample images from different generators
  - `AUTOMATIC1111/` - A1111 sample images
  - `Fooocus/` - Fooocus sample images  
  - `ComfyUI/` - ComfyUI sample images
  - `InvokeAI/` - InvokeAI sample images
  - `NovelAI/` - NovelAI sample images

- **`/bad_images/`** - Corrupted/invalid images for error handling tests

### Test Utilities
- **`test-utils.ts`** - Helper functions for creating mock data and test images
- **`setup.ts`** - Jest setup and global test configuration

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only  
npm test -- tests/unit

# Run integration tests only
npm test -- tests/integration

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/unit/parsers/automatic1111.test.ts

# Run in watch mode
npm test -- --watch
```

## Test Categories

### 🧪 Unit Tests
- ✅ Data model creation and validation
- ✅ Parser parameter parsing logic  
- ✅ Metadata extraction functions
- ✅ ParserManager configuration and options
- ✅ Error handling and edge cases

### 🔗 Integration Tests  
- ✅ End-to-end image parsing with real files
- ✅ Multiple parser coordination
- ✅ Different eagerness levels
- ✅ Buffer vs file path input handling

### 🛡️ Error Handling Tests
- ✅ Invalid image data
- ✅ Missing required fields
- ✅ Malformed JSON parameters
- ✅ Corrupted image files

## Coverage Goals

The test suite aims for:
- **90%+ statement coverage** across all source files
- **85%+ branch coverage** for conditional logic
- **100% coverage** of public API methods
- **Complete error path testing** for robustness

## Test Data

Test images are intentionally small/cropped to keep the repository size manageable while still providing real-world metadata examples from each supported generator.

## Contributing Tests

When adding new features:

1. **Add unit tests** for new functions/classes
2. **Add integration tests** for new parsers or major features  
3. **Update test utilities** if creating new mock data patterns
4. **Ensure error cases are tested** - both expected errors and edge cases
5. **Update this README** if adding new test categories

## Test Performance

- Tests should complete in under 10 seconds total
- Individual test timeouts are set to 10 seconds for image processing
- Use `createTestPng()` and `createTestJpeg()` helpers for synthetic test images
- Real image tests are optional (skip gracefully if files missing)
