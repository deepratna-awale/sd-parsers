/**
 * Jest setup file for sd-parsers tests
 * 
 * This file is run before all tests and sets up global test configuration
 */

// Increase timeout for image processing tests
jest.setTimeout(10000);

// Mock console.warn for tests that expect warnings
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
});
