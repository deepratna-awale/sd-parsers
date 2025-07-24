# SD-Parsers Examples

This directory contains TypeScript examples demonstrating how to use sd-parsers.

## Examples

* **Basic usage**: [basic.ts](basic.ts) - Simple image parsing example
* **Advanced usage**: [advanced.ts](advanced.ts) - Advanced parsing with configuration options

## Running Examples

To run the examples:

1. Build the project first:
```bash
npm run build
```

2. Run an example with ts-node:
```bash
npx ts-node examples/basic.ts
```

Or compile and run:
```bash
tsc examples/basic.ts
node examples/basic.js
```

## Example Files Required

The examples expect image files in the current directory. You can use images from the test resources:
```bash
cp tests/resources/parsers/AUTOMATIC1111/*.png .
```

Then run the examples to see the parsed metadata output.
