#!/usr/bin/env node

// Checks the upstream Python library (d3x-at/sd-parsers) for releases newer
// than the last one reviewed, and opens one issue per new upstream version
// (stable and pre-releases) listing what changed, so useful fixes and
// features can be picked up here.
//
// Usage: node scripts/check-upstream.mjs [--dry-run]
//
// The last reviewed upstream version is read from .github/upstream-version.
// Update it after reviewing an upstream release.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const UPSTREAM_REPO = 'd3x-at/sd-parsers';
const UPSTREAM_GIT = `https://github.com/${UPSTREAM_REPO}.git`;
const PYPI_URL = 'https://pypi.org/pypi/sd-parsers/json';
const LABEL = 'upstream-change';
const VERSION_FILE = new URL('../.github/upstream-version', import.meta.url);

const dryRun = process.argv.includes('--dry-run');

// PEP 440 subset: N(.N)*[{a|b|rc}N][.postN][.devN]
const PEP440 = /^v?(\d+(?:\.\d+)*)(?:[-_.]?(a|alpha|b|beta|c|rc|pre|preview)[-_.]?(\d*))?(?:[-_.]?post[-_.]?(\d+))?(?:[-_.]?dev[-_.]?(\d+))?$/i;
const PRE_RANK = { a: 0, b: 1, rc: 2 };

function normalizePre(tag) {
  tag = tag.toLowerCase();
  if (tag === 'alpha') return 'a';
  if (tag === 'beta') return 'b';
  if (['c', 'pre', 'preview'].includes(tag)) return 'rc';
  return tag;
}

export function parseVersion(raw) {
  const m = PEP440.exec(raw.trim());
  if (!m) return null;
  return {
    raw: raw.trim().replace(/^v/, ''),
    release: m[1].split('.').map(Number),
    pre: m[2] ? [normalizePre(m[2]), Number(m[3] || 0)] : null,
    post: m[4] !== undefined ? Number(m[4]) : null,
    dev: m[5] !== undefined ? Number(m[5]) : null,
  };
}

export function isPrerelease(v) {
  return v.pre !== null || v.dev !== null;
}

// Sort key per PEP 440: dev-only < pre < final < post
function key(v) {
  let pre;
  if (v.pre) pre = [PRE_RANK[v.pre[0]], v.pre[1]];
  else if (v.dev !== null && v.post === null) pre = [-1, 0];
  else pre = [3, 0];
  return [...pre, v.post === null ? -1 : v.post, v.dev === null ? Infinity : v.dev];
}

export function compareVersions(a, b) {
  const len = Math.max(a.release.length, b.release.length);
  for (let i = 0; i < len; i++) {
    const d = (a.release[i] || 0) - (b.release[i] || 0);
    if (d) return d;
  }
  const [ka, kb] = [key(a), key(b)];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
  }
  return 0;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function upstreamTags() {
  const tags = new Map();
  const out = run('git', ['ls-remote', '--tags', '--refs', UPSTREAM_GIT]);
  for (const line of out.split('\n').filter(Boolean)) {
    const tag = line.split('\t')[1].replace('refs/tags/', '');
    const v = parseVersion(tag);
    if (v) tags.set(v.raw, tag);
  }
  return tags;
}

async function pypiReleases() {
  const res = await fetch(PYPI_URL);
  if (!res.ok) throw new Error(`PyPI request failed: ${res.status}`);
  const data = await res.json();
  const releases = new Map();
  for (const [version, files] of Object.entries(data.releases)) {
    if (!files.length || files.every((f) => f.yanked)) continue;
    releases.set(version, files[0].upload_time_iso_8601 || files[0].upload_time);
  }
  return releases;
}

function upstreamDiff(from, to) {
  const dir = mkdtempSync(join(tmpdir(), 'sd-parsers-upstream-'));
  try {
    run('git', ['clone', '--quiet', '--bare', '--filter=blob:none', UPSTREAM_GIT, dir]);
    const range = `${from}..${to}`;
    const log = run('git', ['--git-dir', dir, 'log', '--no-merges', '--format=- %h %s', range]);
    const stat = run('git', ['--git-dir', dir, 'diff', '--stat=100', range]);
    return { log, stat };
  } catch (err) {
    console.warn(`Could not build upstream diff for ${from}..${to}: ${err.message}`);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function issueExists(version) {
  const out = run('gh', [
    'issue', 'list', '--state', 'all', '--label', LABEL, '--limit', '200',
    '--search', `"upstream ${version}" in:title`, '--json', 'title',
  ]);
  return JSON.parse(out).some((i) => i.title.endsWith(`upstream ${version}`));
}

function ensureLabel() {
  try {
    run('gh', ['label', 'create', LABEL, '--color', '1d76db',
      '--description', 'A new upstream sd-parsers release to review']);
  } catch {
    // label already exists
  }
}

function issueBody({ version, prerelease, published, baseTag, tag, diff }) {
  const lines = [
    `Upstream [\`${UPSTREAM_REPO}\`](https://github.com/${UPSTREAM_REPO}) has a new ${prerelease ? 'pre-release' : 'release'}: **${version}**${published ? `, published ${published.slice(0, 10)}` : ''}.`,
    '',
    'Review the changes below and pick up any fixes or features worth having here.',
    '',
    '### Links',
    tag ? `- Release notes: https://github.com/${UPSTREAM_REPO}/releases/tag/${tag}` : '- No upstream git tag found for this version',
    baseTag && tag ? `- Full diff: https://github.com/${UPSTREAM_REPO}/compare/${baseTag}...${tag}` : null,
    published ? `- PyPI: https://pypi.org/project/sd-parsers/${version}/` : null,
  ].filter((l) => l !== null);

  if (diff) {
    lines.push('', `### Upstream commits since \`${baseTag}\``, '', diff.log || '_No commits_');
    lines.push('', '<details><summary>Changed files</summary>', '', '```', diff.stat, '```', '', '</details>');
  }

  lines.push('', `When done, set \`.github/upstream-version\` to \`${version}\`.`);
  return lines.join('\n');
}

async function main() {
  const lastRaw = readFileSync(VERSION_FILE, 'utf8').trim();
  const last = parseVersion(lastRaw);
  if (!last) throw new Error(`Invalid version in .github/upstream-version: ${lastRaw}`);

  const [tags, pypi] = await Promise.all([upstreamTags(), pypiReleases()]);
  const find = (map, v) => [...map.entries()].find(([raw]) => compareVersions(parseVersion(raw), v) === 0)?.[1];

  const versions = [];
  for (const raw of new Set([...tags.keys(), ...pypi.keys()])) {
    const v = parseVersion(raw);
    if (v && !versions.some((o) => compareVersions(o, v) === 0)) versions.push(v);
  }
  const newer = versions.filter((v) => compareVersions(v, last) > 0).sort(compareVersions);

  console.log(`Last reviewed upstream version: ${last.raw}`);
  if (!newer.length) {
    console.log('No new upstream releases.');
    return;
  }

  if (!dryRun) ensureLabel();

  let base = last;
  for (const v of newer) {
    const title = `Review upstream ${v.raw}`;
    if (!dryRun && issueExists(v.raw)) {
      console.log(`Issue already exists for ${v.raw}`);
      base = v;
      continue;
    }

    const baseTag = find(tags, base);
    const tag = find(tags, v);
    const body = issueBody({
      version: v.raw,
      prerelease: isPrerelease(v),
      published: find(pypi, v),
      baseTag,
      tag,
      diff: baseTag && tag ? upstreamDiff(baseTag, tag) : null,
    });

    if (dryRun) {
      console.log(`\n=== ${title} ===\n${body}`);
    } else {
      console.log(`Opened ${run('gh', ['issue', 'create', '--title', title, '--label', LABEL, '--body', body])}`);
    }
    base = v;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
