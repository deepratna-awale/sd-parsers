# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-24

### Added
- Complete TypeScript port of the Python sd-parsers library
- Support for all major Stable Diffusion image generators:
  - AUTOMATIC1111 webui ✅
  - Fooocus ✅
  - ComfyUI ✅
  - InvokeAI ✅
  - NovelAI ✅
- ParserManager class for orchestrating multiple parsers
- Sharp-based image processing for Node.js environments
- Comprehensive TypeScript type definitions and interfaces
- Jest-based test suite with full parser coverage
- CLI interface for command-line usage (`npx sd-parsers`)
- Configurable metadata extraction with eagerness levels (FAST, DEFAULT, EAGER)
- Full async/await support throughout the API
- Debug mode for troubleshooting parser issues
- Buffer and file path parsing support
- Helper functions for common data access patterns

### Features
- Extract prompts, negative prompts, and generation parameters
- Parse model information and sampler configurations
- Support for PNG and JPEG image formats
- Configurable parser selection and options
- Type-safe API with full IntelliSense support
- Error handling with custom exception types

### Technical Implementation
- Built with TypeScript 5.x for modern JavaScript environments
- Uses Sharp for efficient image processing
- Modular parser architecture for extensibility
- Comprehensive data models for all metadata types
- Configurable extraction pipeline with multiple eagerness levels

## [Unreleased]

### Planned
- Enhanced EXIF metadata extraction
- Additional helper functions for metadata analysis
- Streaming support for large files

---

*Note: This TypeScript implementation is a complete port of the original Python sd-parsers library, providing equivalent functionality with TypeScript/Node.js-specific enhancements.*
