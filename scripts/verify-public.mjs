import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const redirectHash = digest(await readFile(new URL('./legacy-redirect.html', import.meta.url)));
const revision = process.argv[2];
const site = 'https://demo.naraconsultores.com';
const routes = await Promise.all(['NaraFlows', 'NaraBizagui'].map(async route => {
  const base = `${site}/${route}/`;
  const read = async file => {
    const response = await fetch(`${base}${file}?verify=${revision || Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${response.status}: ${route}/${file}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const published = JSON.parse(await read('publication.json'));
  const remoteManifest = JSON.parse(await read('manifest.json'));
  const entries = Object.entries(published.files);
  const expected = route === 'NaraBizagui' ? { ...manifest, 'index.html': redirectHash } : manifest;
  const manifestMatches = Object.keys(remoteManifest).length === Object.keys(expected).length &&
    Object.entries(expected).every(([file, hash]) => remoteManifest[file] === hash && published.files[file] === hash);
  const resources = [];
  for (let i = 0; i < entries.length; i += 8) {
    resources.push(...await Promise.all(entries.slice(i, i + 8).map(async ([file, expected]) => {
      if (!/^(?:[\w.-]+\/)*[\w.-]+$/.test(file) || file.split('/').includes('..')) throw new Error('Unsafe publication path');
      const actual = digest(await read(file));
      return { file, matches: actual === expected };
    })));
  }
  return { route, commit: published.commit, manifestMatches, resources,
    allMatch: manifestMatches && (!revision || revision === published.commit) && resources.every(resource => resource.matches) };
}));
const result = { date: new Date().toISOString(), routes, allMatch: routes.every(route => route.allMatch) };
await mkdir(new URL('../local/', import.meta.url), { recursive: true });
await writeFile(new URL('../local/verificacion_publicacion_mcp.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ allMatch: result.allMatch, routes: routes.map(({route, commit, allMatch, resources}) => ({
  route, commit, allMatch, resources: resources.length, mismatches: resources.filter(resource => !resource.matches)
})) }, null, 2));
if (!result.allMatch) process.exitCode = 1;
