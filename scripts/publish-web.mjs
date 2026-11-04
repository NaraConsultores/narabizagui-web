// Export the editor at its canonical and compatibility paths on the same origin.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const targetIndex = process.argv.indexOf('--target');
if (targetIndex < 0 || !process.argv[targetIndex + 1]) {
  throw new Error('Usage: node scripts/publish-web.mjs --target <checkout of NaraConsultores/NaraConsultores.github.io>');
}
const target = path.resolve(process.argv[targetIndex + 1]);
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024 });
const remote = git(target, 'remote', 'get-url', 'origin').toString().trim();
if (!/^https:\/\/github\.com\/NaraConsultores\/NaraConsultores\.github\.io(?:\.git)?$/i.test(remote)) {
  throw new Error('The target must be the existing demos publication repository.');
}
if (git(target, 'status', '--porcelain').toString().trim()) {
  throw new Error('The publication checkout has pending changes; preserve them before exporting.');
}
if (git(root, 'status', '--porcelain', '--', 'manifest.json', 'index.html', '*.js', '*.css', 'assets', 'vendor').toString().trim()) {
  throw new Error('Commit the validated web assets before exporting them.');
}
const revision = git(root, 'rev-parse', 'HEAD').toString().trim();
const manifest = JSON.parse(git(root, 'show', 'HEAD:manifest.json').toString());
const tracked = git(root, 'ls-tree', '-rz', 'HEAD').toString().split('\0').filter(Boolean).map(entry => entry.split('\t')[1]);
const files = tracked.filter(file =>
  /^(?:assets|vendor)\//.test(file) ||
  (!file.includes('/') && (/\.(?:html|js|css|ico)$/.test(file) || ['manifest.json', 'THIRD_PARTY_NOTICES.md'].includes(file)))
);
const routes = ['NaraFlows', 'NaraBizagui'];
const output = routes.map(route => path.join(target, route));
const hashes = {};
const assets = new Map();
for (const file of files) {
  if (file.split('/').includes('..')) throw new Error('Unsafe asset path');
  const bytes = git(root, 'show', `HEAD:${file}`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (manifest[file] && manifest[file] !== digest) throw new Error(`Stale manifest: ${file}`);
  hashes[file] = digest;
  assets.set(file, bytes);
}
for (const file of Object.keys(manifest)) {
  if (!hashes[file]) throw new Error(`Missing distributed asset: ${file}`);
}
const publication = JSON.stringify({
  source: 'https://github.com/NaraConsultores/naraflows-web',
  commit: revision,
  url: 'https://demo.naraconsultores.com/NaraFlows/',
  compatibilityUrl: 'https://demo.naraconsultores.com/NaraBizagui/',
  files: hashes,
}, null, 2) + '\n';
for (const directory of output) {
  for (const [file, bytes] of assets) {
    const destination = path.join(directory, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  await writeFile(path.join(directory, '.nojekyll'), '');
  await writeFile(path.join(directory, 'publication.json'), publication);
}
console.log(JSON.stringify({ status: 'EXPORTED', files: files.length, manifestAssets: Object.keys(manifest).length, revision, output }));
console.log('Review and commit only NaraFlows/ and NaraBizagui/ in the publication repository, then push main.');
