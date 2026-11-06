import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '../..');
const cli = path.join(root, 'bin/cli.js');
const resources = path.join(__dirname, '../resources/parsers');

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

// The CLI loads the compiled library, so these tests need `npm run build` first
const describeBuilt = existsSync(path.join(root, 'dist/index.js')) ? describe : describe.skip;

describeBuilt('CLI', () => {
  it('prints the metadata as text by default', () => {
    const { code, stdout } = run(path.join(resources, 'AUTOMATIC1111/automatic1111_cropped.png'));
    expect(code).toBe(0);
    expect(stdout).toContain('Prompt: photo of a duck');
    expect(stdout).toContain('Negative Prompt: monochrome');
  });

  it('prints a JSON array with --json', () => {
    const png = path.join(resources, 'AUTOMATIC1111/automatic1111_cropped.png');
    const { code, stdout } = run('--json', png, path.join(root, 'README.md'));
    expect(code).toBe(0);
    const results = JSON.parse(stdout);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      file: png,
      format: 'PNG',
      found: true,
      generator: 'AUTOMATIC1111',
      full_prompt: 'photo of a duck',
      full_negative_prompt: 'monochrome',
    });
    expect(results[1]).toEqual({ file: path.join(root, 'README.md'), format: null, found: false });
  });

  it('reads stealth metadata only with --eager', () => {
    const png = path.join(resources, 'AUTOMATIC1111/automatic1111_stealth.png');
    expect(JSON.parse(run('--json', png).stdout)[0].found).toBe(false);
    const [eager] = JSON.parse(run('--json', '--eager', png).stdout);
    expect(eager).toMatchObject({ found: true, full_prompt: 'a circle' });
  });

  it('reports missing files and exits with 1', () => {
    const { code, stdout } = run('--json', 'missing.png');
    expect(code).toBe(1);
    expect(JSON.parse(stdout)[0]).toMatchObject({ file: 'missing.png', error: expect.stringContaining('ENOENT') });
  });

  it('rejects unknown options and missing files', () => {
    expect(run('--bogus').code).toBe(1);
    expect(run().code).toBe(1);
    expect(run('--help')).toMatchObject({ code: 0, stdout: expect.stringContaining('--json') });
  });
});
