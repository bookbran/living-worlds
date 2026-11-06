#!/usr/bin/env node
'use strict';
// ── Astrolabe release on merge ──────────────────────────────────────────────
//
// Copied into a store listing's repo as .github/astrolabe/release.js by
// `node dashboard/dev/astrolabify.js <repo>`, and run by the workflow beside it
// (.github/workflows/astrolabe-release.yml). No dependencies: Node 20 and git.
//
// The rule it carries: a merged pull request is a release. The Astrolabe store
// and Claude Code both decide "is there an update" by the version in
// .claude-plugin/marketplace.json, so a merge that leaves the version alone
// never reaches anyone who installed it. This closes that gap without the
// person merging knowing any of it.
//
//   preview   a pull request opened, edited or relabelled: post (or refresh)
//             one comment saying what version it becomes and the note members
//             will read, and how to change either. This is the "ask first".
//   release   a pull request merged: raise the version in every file that
//             carries it, add the note to CHANGELOG.md, and leave the files
//             for the workflow to commit.
//
// What the author can say, all in the pull request itself:
//   a line "Store note: <a sentence or two>"  the note members read (default: the title)
//   label `minor` or `major`                   a bigger step (default: patch)
//   label `no-release`                         merge without a release
//   change the version themselves              kept as they set it, no extra step
//
// Pull requests that touch only docs/, .github/, README.md or CHANGELOG.md do
// not release, since nothing a member runs changed.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MARK = '<!-- astrolabe-release -->';
const NON_RELEASE = (f) => /^(docs\/|\.github\/)/.test(f) || /^(README|CHANGELOG)\.md$/i.test(f);

const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const pr = ev.pull_request;
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const root = process.cwd();
const mode = process.argv[2];

async function gh(method, url, body) {
  const r = await fetch('https://api.github.com' + url, {
    method,
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'astrolabe-release' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(method + ' ' + url + ' ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.status === 204 ? null : r.json();
}

async function changedFiles() {
  const out = [];
  for (let page = 1; page < 30; page++) {
    const batch = await gh('GET', `/repos/${repo}/pulls/${pr.number}/files?per_page=100&page=${page}`);
    out.push(...batch.map((f) => f.filename));
    if (batch.length < 100) break;
  }
  return out;
}

const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return null; } };
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);
const showAt = (sha, f) => { try { return execFileSync('git', ['show', sha + ':' + f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return null; } };

function bump(v, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v));
  if (!m) throw new Error('Cannot read the version "' + v + '"');
  let [a, b, c] = m.slice(1).map(Number);
  if (kind === 'major') { a++; b = 0; c = 0; } else if (kind === 'minor') { b++; c = 0; } else c++;
  return `${a}.${b}.${c}`;
}

// the note members read: the author's "Store note:" line, else the title
// without a commit-style prefix ("fix(ui): ..."), as a sentence
function storeNote() {
  const line = /^\s*store note:\s*(.+)$/im.exec(pr.body || '');
  let s = (line ? line[1] : pr.title || '').trim();
  if (!line) s = s.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '');
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s && !/[.!?]$/.test(s)) s += '.';
  return s;
}

const labels = () => (pr.labels || []).map((l) => String(l.name).toLowerCase());
const kind = () => (labels().includes('major') ? 'major' : labels().includes('minor') ? 'minor' : 'patch');

// Each plugin the marketplace lists, the folder it lives in, and whether this
// pull request touched it. A repo that is one plugin (source "./") is touched
// by any change that is not docs-only.
function plan(files) {
  const market = JSON.parse(read('.claude-plugin/marketplace.json') || 'null');
  if (!market || !Array.isArray(market.plugins)) return { why: 'This repo has no .claude-plugin/marketplace.json, so there is no store version to raise.' };
  const real = files.filter((f) => !NON_RELEASE(f));
  const before = JSON.parse(showAt(pr.base.sha, '.claude-plugin/marketplace.json') || 'null');
  const out = [];
  for (const p of market.plugins) {
    if (!p || !p.name || !p.version) continue;
    const dir = String(p.source || './').replace(/^\.\//, '').replace(/\/$/, '');
    const touched = dir ? real.some((f) => f.startsWith(dir + '/')) : real.length > 0;
    if (!touched) continue;
    const was = before && (before.plugins || []).find((q) => q && q.name === p.name);
    const selfBumped = was && was.version && was.version !== p.version;
    out.push({ name: p.name, dir, from: selfBumped ? was.version : p.version, to: selfBumped ? p.version : bump(p.version, kind()), selfBumped });
  }
  if (!out.length) return { why: 'Only docs changed here, so this merges without a new version.' };
  return { plugins: out, note: storeNote() };
}

// ── release: write the new version everywhere it is carried ─────────────────
function setVersions(p) {
  const touched = [];
  const json = (f, fn) => {
    const s = read(f); if (s == null) return;
    const v = JSON.parse(s); fn(v);
    const next = JSON.stringify(v, null, 2) + '\n';
    if (next !== s) { write(f, next); touched.push(f); }
  };
  json('.claude-plugin/marketplace.json', (m) => {
    for (const q of m.plugins) if (q && q.name === p.name) q.version = p.to;
    if (m.metadata && m.metadata.version === p.from) m.metadata.version = p.to;
  });
  const pre = p.dir ? p.dir + '/' : '';
  json(pre + '.claude-plugin/plugin.json', (v) => { if (v.version) v.version = p.to; });
  json(pre + 'package.json', (v) => { if (v.version === p.from) v.version = p.to; });
  const py = read(pre + 'pyproject.toml');
  if (py != null) {
    const next = py.replace(/(\[project\][^[]*?\nversion\s*=\s*")[^"]+(")/, `$1${p.to}$2`);
    if (next !== py) { write(pre + 'pyproject.toml', next); touched.push(pre + 'pyproject.toml'); }
    const name = (/\[project\][^[]*?\nname\s*=\s*"([^"]+)"/.exec(py) || [])[1];
    const lock = read(pre + 'uv.lock');
    if (name && lock != null) {
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nl = lock.replace(new RegExp(`(name = "${esc}"\\r?\\nversion = ")[^"]+(")`), `$1${p.to}$2`);
      if (nl !== lock) { write(pre + 'uv.lock', nl); touched.push(pre + 'uv.lock'); }
    }
  }
  return touched;
}

function addChangelog(dir, version, note) {
  const f = (dir ? dir + '/' : '') + 'CHANGELOG.md';
  let s = read(f) || '# Changelog\n\nWhat each version changed, newest first. The Astrolabe store shows these notes when it offers an update.\n';
  if (new RegExp('^## ' + version.replace(/\./g, '\\.') + '\\s*$', 'm').test(s)) return f;
  const entry = `## ${version}\n\n${note} (#${pr.number})\n\n`;
  const at = s.search(/^## /m);
  s = at < 0 ? s.replace(/\s*$/, '\n\n') + entry : s.slice(0, at) + entry + s.slice(at);
  write(f, s.replace(/\n+$/, '\n'));
  return f;
}

function setOutput(k, v) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
}

async function preview() {
  const files = await changedFiles();
  const p = plan(files);
  let body;
  if (labels().includes('no-release')) body = 'This merges **without a new version**, because of the `no-release` label. Remove the label to release it.';
  else if (p.why) body = p.why;
  else {
    const lines = p.plugins.map((x) => x.selfBumped
      ? `**${x.name}** goes to **${x.to}** (the version you set).`
      : `**${x.name}** goes from ${x.from} to **${x.to}**.`);
    body = [
      'When this merges, the Astrolabe store offers an update:',
      '', ...lines, '',
      'People who have it will read this note:',
      '', '> ' + (p.note || '(no note yet)'), '',
      'To change the note, add a line to the description: `Store note: what people will notice, in a sentence or two.`',
      'Add the label `minor` or `major` for a bigger step, or `no-release` to merge without a new version.',
    ].join('\n');
  }
  body = MARK + '\n' + body;
  const comments = await gh('GET', `/repos/${repo}/issues/${pr.number}/comments?per_page=100`);
  const mine = comments.find((c) => c.body && c.body.startsWith(MARK));
  if (mine) { if (mine.body !== body) await gh('PATCH', `/repos/${repo}/issues/comments/${mine.id}`, { body }); }
  else await gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body });
}

async function release() {
  if (!pr.merged) return;
  if (labels().includes('no-release')) return console.log('no-release label: nothing to do');
  const p = plan(await changedFiles());
  if (p.why) return console.log(p.why);
  const versions = [];
  for (const x of p.plugins) {
    if (!x.selfBumped) setVersions(x);
    addChangelog(x.dir, x.to, p.note);
    versions.push((p.plugins.length > 1 ? x.name + ' ' : '') + x.to);
  }
  setOutput('released', 'true');
  setOutput('message', `Release ${versions.join(', ')}: ${p.note.replace(/[\r\n]+/g, ' ')} (#${pr.number}) [skip ci]`);
  console.log('released', versions.join(', '));
}

(mode === 'release' ? release() : preview()).catch((e) => { console.error(e.message); process.exit(1); });
