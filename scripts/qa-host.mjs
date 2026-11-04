// Disposable QA harness: isolated MCP process, allowlisted static files, no client data.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const key = randomBytes(32).toString('hex');
const client = new Client({ name: 'naraflows-browser-qa', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'plugins/naraflows/server/dist/server.mjs')], stderr: 'inherit' }));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${server.address().port}` || req.headers.origin || req.headers['x-qa-key'] !== key) { res.writeHead(403); res.end(); return; }
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && pathname.startsWith('/web/')) {
      const file = pathname.slice(5);
      if (!Object.hasOwn(manifest, file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(path.join(root, file))); return;
    }
    if (req.method === 'POST' && pathname === '/tool') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 100000) throw new Error('Request too large'); }
      const input = JSON.parse(body);
      const result = await client.callTool(input);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); return;
    }
    res.writeHead(404); res.end();
  } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir(path.join(root, 'local'), { recursive: true });
await writeFile(path.join(root, 'local/qa-info.json'), JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, key, pid: process.pid }));
console.log('Disposable QA host ready; connection details are private in local/qa-info.json.');
let closing = false;
async function close() { if (closing) return; closing = true; server.closeAllConnections(); server.close(); await client.close(); process.exit(0); }
process.once('SIGINT', close); process.once('SIGTERM', close);
