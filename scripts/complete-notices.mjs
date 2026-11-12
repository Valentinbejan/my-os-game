import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
const out = resolve('public/licenses');
const dependencies = JSON.parse(readFileSync(join(out, 'DEPENDENCIES.json'), 'utf8'));
const safe = (value) => value.replace(/[^a-zA-Z0-9._-]/g, '_');
const folder = (ecosystem, name, version) =>
  join(out, (ecosystem === 'npm' ? 'npm-' : 'rust-') + safe(name) + '-' + version);
function save(dir, name, text) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), text);
}
function copyNotices(source, destination) {
  for (const item of readdirSync(source))
    if (/^(license|notice|copying)/i.test(item))
      copyFileSync(join(source, item), join(destination, item));
}
for (const [child, parent] of [
  ['@humanfs/types', '@humanfs/core'],
  ['@rolldown/binding-win32-x64-msvc', 'rolldown'],
  ['@tauri-apps/cli-win32-x64-msvc', '@tauri-apps/cli'],
]) {
  const pkg = JSON.parse(readFileSync(join('node_modules', child, 'package.json'), 'utf8'));
  copyNotices(join('node_modules', parent), folder('npm', child, pkg.version));
}
const es = readFileSync('node_modules/esrecurse/esrecurse.js', 'utf8');
save(folder('npm', 'esrecurse', '4.3.0'), 'NOTICE.txt', es.slice(0, es.indexOf('*/') + 2));
const im = readFileSync('node_modules/imurmurhash/README.md', 'utf8');
const mit = im.slice(im.indexOf('License (MIT)'));
save(folder('npm', 'imurmurhash', '0.1.4'), 'LICENSE.txt', mit);
const standardMit = mit.slice(mit.indexOf('Permission is hereby granted'));
save(
  folder('npm', 'natural-compare', '1.4.0'),
  'LICENSE.txt',
  'Copyright (c) 2012-2015 Lauri Rooden <lauri@rooden.ee>\nLicense: MIT (package manifest and README).\n\n' +
    standardMit,
);
save(
  folder('npm', 'stackback', '0.0.2'),
  'LICENSE.txt',
  'Author: Roman Shtylman <shtylman@gmail.com>. License: MIT (package manifest).\n\n' + standardMit,
);
const v8 = readFileSync('node_modules/stackback/formatstack.js', 'utf8');
save(
  folder('npm', 'stackback', '0.0.2'),
  'NOTICE-V8.txt',
  v8
    .split('\n')
    .filter((line, index, lines) => index < lines.findIndex((l) => l.trim() && !l.startsWith('//')))
    .join('\n'),
);
const registryRoot = resolve('.tools/cargo/registry/src');
const registries = readdirSync(registryRoot).map((name) => join(registryRoot, name));
const cache = new Map();
async function upstream(repo, sha) {
  const key = repo + '@' + sha;
  if (cache.has(key)) return cache.get(key);
  const task = (async () => {
    const listingUrl = 'https://api.github.com/repos/' + repo + '/contents?ref=' + sha;
    const response = await fetch(listingUrl, {
      headers: { 'User-Agent': 'SIGNAL91-license-audit' },
    });
    if (!response.ok) throw new Error(listingUrl + ' ' + response.status);
    const items = await response.json();
    const notices = items.filter(
      (item) => item.type === 'file' && /^(license|copying|notice)/i.test(item.name),
    );
    if (!notices.length) throw new Error('No root notices at ' + listingUrl);
    return Promise.all(
      notices.map(async (item) => {
        const r = await fetch(item.download_url);
        if (!r.ok) throw new Error(item.download_url);
        return { name: item.name, text: await r.text(), url: item.download_url };
      }),
    );
  })();
  cache.set(key, task);
  return task;
}
for (const item of dependencies.filter((d) => d.ecosystem === 'Rust')) {
  const dir = folder(item.ecosystem, item.name, item.version);
  if (readdirSync(dir).length) continue;
  const source = registries
    .map((root) => join(root, item.name + '-' + item.version))
    .find((p) => existsSync(p));
  const vcs = JSON.parse(readFileSync(join(source, '.cargo_vcs_info.json'), 'utf8'));
  const repo = new URL(item.source).pathname
    .replace(/^\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');
  const notices = await upstream(repo, vcs.git.sha1);
  for (const notice of notices) save(dir, notice.name, notice.text);
  save(
    dir,
    'SOURCE.txt',
    notices.map((n) => n.url).join('\n') +
      '\nRetrieved 2026-09-22 for ' +
      item.name +
      ' ' +
      item.version +
      '.\n',
  );
}
console.log('Completed omitted upstream license texts and embedded source notices.');
