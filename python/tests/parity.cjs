// Writes what the npm package makes of the given images, for the Python package's parity test
const { readFileSync } = require('fs');
const { createHash } = require('crypto');
const { ParserManager, stripMetadata, copyMetadata, writeMetadata, toInfotext } = require('../../dist/index.js');

const [targetsArg, ...files] = process.argv.slice(2);
const targets = targetsArg.split(',');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const attempt = (make) => {
  try {
    return hash(make());
  } catch (error) {
    return `error: ${error.constructor.name}`;
  }
};

(async () => {
  const manager = new ParserManager();
  const results = {};
  for (const file of files) {
    const bytes = new Uint8Array(readFileSync(file));
    const entry = { strip: attempt(() => stripMetadata(bytes)), copy: {} };
    for (const target of targets) entry.copy[target] = attempt(() => copyMetadata(bytes, new Uint8Array(readFileSync(target))));
    let promptInfo = null;
    try {
      promptInfo = await manager.parse(bytes);
    } catch {}
    entry.a1111 = promptInfo ? attempt(() => writeMetadata(bytes, toInfotext(promptInfo))) : null;
    results[file] = entry;
  }
  process.stdout.write(JSON.stringify(results));
})();
