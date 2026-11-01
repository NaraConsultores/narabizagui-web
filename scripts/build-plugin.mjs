import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'plugins/narabizagui/server/dist');
await mkdir(output, { recursive: true });
const result = await build({ entryPoints: [path.join(root, 'plugins/narabizagui/server/index.mjs')], outfile: path.join(output, 'server.mjs'), bundle: true, preserveSymlinks: true, platform: 'node', target: 'node22', format: 'esm', metafile: true, legalComments: 'inline', banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } });
async function noticesFor(metadata) {
const packages = new Set();
for (const input of Object.keys(metadata.inputs)) {
  const normalized = input.replaceAll('\\', '/');
  const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(normalized);
  if (match) packages.add(match[1]);
}
const notices = ['NaraBizagui MCP — bundled third-party licenses.\n'];
for (const name of [...packages].sort()) {
  const dir = path.join(root, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  let license;
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'license.txt']) {
    try { license = await readFile(path.join(dir, file), 'utf8'); break; } catch { /* Try the next conventional license name. */ }
  }
  if (!license) throw new Error(`Missing bundled license: ${name}`);
  notices.push(`\n--- ${name}@${pkg.version} (${pkg.license}) ---\n${license}`);
}
return { text: notices.join('\n').replaceAll('\r\n','\n'), count: packages.size };
}
const serverNotices = await noticesFor(result.metafile);
await writeFile(path.join(output, 'THIRD_PARTY_NOTICES.txt'), serverNotices.text);
const browserResult = await build({ entryPoints: [path.join(root, 'scripts/sheets-import-entry.js')], outfile: path.join(root, 'vendor/sheets-import.js'), bundle: true, preserveSymlinks: true, platform: 'browser', target: 'es2022', format: 'iife', metafile: true, legalComments: 'inline' });
await writeFile(path.join(root, 'vendor/bpmn-js.css'), (await readFile(path.join(root, 'node_modules/bpmn-js/dist/assets/bpmn-js.css'), 'utf8')).replaceAll('\r\n','\n'));
const sheetNotices = await noticesFor(browserResult.metafile);
await writeFile(path.join(root, 'vendor/SHEETS_LICENSES.txt'), sheetNotices.text.replace('NaraBizagui MCP', 'NaraBizagui native sheet importer'));
const microsoftResult = await build({ entryPoints: [path.join(root, 'scripts/microsoft-entry.js')], outfile: path.join(root, 'vendor/microsoft-client.js'), bundle: true, preserveSymlinks: true, platform: 'browser', target: 'es2022', format: 'iife', metafile: true, legalComments: 'inline' });
await build({ entryPoints: [path.join(root, 'scripts/microsoft-auth-entry.js')], outfile: path.join(root, 'vendor/microsoft-auth.js'), bundle: true, preserveSymlinks: true, platform: 'browser', target: 'es2022', format: 'iife', legalComments: 'inline' });
const microsoftNotices = await noticesFor(microsoftResult.metafile);
await writeFile(path.join(root, 'vendor/MICROSOFT_LICENSES.txt'), microsoftNotices.text.replace('NaraBizagui MCP', 'NaraBizagui Microsoft authentication'));
await build({ entryPoints:[path.join(root,'plugins/narabizagui/shared/audit.mjs')],outfile:path.join(root,'vendor/model-audit.js'),bundle:true,platform:'browser',target:'es2022',format:'iife',globalName:'NaraModelAudit',legalComments:'inline' });
const distributed = ['index.html', 'modelador.js', 'modelador.css', 'archivos.js', 'autoguardado.js', 'mcp-editor.js', 'mcp-bridge.js', 'editor-tools.js', 'sheets.js','erd-model.js','erd-editor.js','editor-style.js', 'assets/narabizagui_blanco.png', 'vendor/bpmn-modeler.production.min.js', 'vendor/bpmn.css', 'vendor/bpmn.woff2', 'vendor/diagram-js.css', 'vendor/LICENSE.txt', 'vendor/sheets-import.js', 'vendor/bpmn-js.css', 'vendor/SHEETS_LICENSES.txt'];
const manifest = {};

distributed.push('favicon.ico','assets/favicon-nb.png');
distributed.push('editor-visual.js','tab-ownership.js','editor-touch.js');
distributed.push('workspace.css','workspace-ui.js','instant-edit.js','editor-structure.js','editor-readiness.js');
distributed.push('editor-operations.js','editor-blocks.js','vendor/model-audit.js','bpmn-merge.js', 'editor-properties.js', 'microsoft-ui.js', 'microsoft-auth.html', 'assets/microsoft-symbol.svg', 'vendor/microsoft-client.js', 'vendor/microsoft-auth.js', 'vendor/MICROSOFT_LICENSES.txt');
for (const file of distributed) manifest[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
// Use content versions so an existing browser cache cannot mix old and new code.
for (const page of ['index.html', 'microsoft-auth.html']) {
  const source = (await readFile(path.join(root,page),'utf8')).replace(/(<meta name="narabizagui-build" content=")[^"]*(">)/, (_,a,b)=>a+createHash('sha256').update(Object.entries(manifest).filter(([p])=>/\.js$/.test(p)).map(([,hash])=>hash).join('')).digest('hex').slice(0,16)+b);
  const html = source.replace(/((?:src|href)=["'])([^"'?#]+)(?:\?[^"'#]*)?(["'])/g, (match, prefix, file, quote) =>
    manifest[file] && (/\.(?:js|css)$/.test(file)||file==='favicon.ico'||file==='assets/favicon-nb.png') ? `${prefix}${file}?v=${manifest[file].slice(0, 16)}${quote}` : match);
  await writeFile(path.join(root, page), html);
  manifest[page] = createHash('sha256').update(html).digest('hex');
}
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built plugin (${serverNotices.count} attributed dependencies) and native sheet importer (${sheetNotices.count}); updated ${distributed.length} web hashes.`);
