import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { startBridge } from '../plugins/naraflows/server/bridge.mjs';

const source = await readFile(new URL('../mcp-bridge.js', import.meta.url), 'utf8');
const origin = 'https://demo.naraconsultores.com';
const storageKey = 'narabizagui.codex.session.v1';
function tabStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function openTab({ storage, hash = '', revision = 'r1', temporaryFailures = 0,readError }) {
  const nodes = new Map(), events = new Map(), calls = [];
  const stats = { failures: 0, reads: 0 };
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', value: '', hidden: false, disabled: false,
      classList: { toggle() {} }, focus() {}, showModal() {}, close() {} });
    return nodes.get(id);
  };
  get('diagramTitle').textContent = 'Generic test.bpmn';
  const context = {
    document: { getElementById: get }, sessionStorage: storage,
    location: { hash, pathname: '/NaraFlows/', search: '' },
    history: { replaceState() {} }, AbortController, AbortSignal, URLSearchParams,
    setTimeout: fn => setTimeout(fn, 0),
    window: { addEventListener: (type, callback) => events.set(type, callback),
      NaraFlowsEditor: { async read() { stats.reads++;if(readError)throw readError;return { revision }; } } },
    async fetch(url, options) {
      calls.push(new URL(url).pathname);
      if (String(url).endsWith('/poll') && temporaryFailures-- > 0) { stats.failures++; throw new TypeError('Temporary network interruption'); }
      return fetch(url, { ...options, headers: { ...options.headers, Origin: origin } });
    }
  };
  vm.runInNewContext(source, context);
  return { get, calls, stats, unload: () => events.get('pagehide')() };
}
async function until(condition) {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Browser bridge state did not settle');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('the same tab restores its authorized MCP session after reload and temporary network failures', async t => {
  const bridge = await startBridge(), storage = tabStorage(), tabs = [];
  t.after(async () => { tabs.forEach(tab => tab.unload()); await bridge.close(); });
  const initial = openTab({ storage, hash: '#mcp=' + bridge.pair().pairingCode });
  tabs.push(initial);
  await initial.get('codexForm').onsubmit({ preventDefault() {} });
  const session = bridge.list()[0];
  assert.ok(session);
  assert.equal((await bridge.request(session.sessionId, 'read', {})).revision, 'r1');
  const stored = JSON.parse(storage.getItem(storageKey));
  assert.equal(stored.id, session.sessionId);
  initial.unload();

  const pending = bridge.request(session.sessionId, 'read', {});
  const restored = openTab({ storage, revision: 'r2', temporaryFailures: 4 });
  tabs.push(restored);
  assert.equal((await pending).revision, 'r2');
  assert.equal(restored.stats.failures, 4);
  assert.equal(restored.stats.reads, 1, 'Recovery must not execute a command twice');
  assert.equal(restored.calls.includes('/pair'), false, 'Reload must not require another pairing code');
  assert.equal(JSON.parse(storage.getItem(storageKey)).id, session.sessionId);
  assert.equal(restored.get('connectCodex').textContent, 'Codex conectado');

  await restored.get('codexDisconnect').onclick();
  assert.equal(storage.getItem(storageKey), null);
  assert.equal(bridge.list().length, 0);
});

test('revoked or restarted server sessions clear the stored authorization', async t => {
  const bridge = await startBridge(), storage = tabStorage(), tabs = [];
  t.after(async () => { tabs.forEach(tab => tab.unload()); await bridge.close(); });
  const first = openTab({ storage, hash: '#mcp=' + bridge.pair().pairingCode });
  tabs.push(first);
  await first.get('codexForm').onsubmit({ preventDefault() {} });
  const id = bridge.list()[0].sessionId;
  first.unload(); bridge.disconnect(id);
  const restored = openTab({ storage }); tabs.push(restored);
  await until(() => storage.getItem(storageKey) === null);
  assert.equal(restored.get('connectCodex').textContent, 'Conectar con Codex');
  assert.equal(restored.calls.includes('/pair'), false);
});

test('malformed tab storage is discarded without making a local request', () => {
  const storage = tabStorage();
  storage.setItem(storageKey, JSON.stringify({ version: 1, port: 99999, id: 'bad', token: 'bad' }));
  const tab = openTab({ storage });
  assert.equal(storage.getItem(storageKey), null);
  assert.equal(tab.calls.length, 0);
});

test('browser and server preserve actionable error metadata without retrying the editor command',async t=>{
 const bridge=await startBridge(),storage=tabStorage();let tab;
 t.after(async()=>{tab?.unload();await bridge.close();});
 tab=openTab({storage,hash:'#mcp='+bridge.pair().pairingCode,readError:Object.assign(Error('Still restoring'),{code:'EDITOR_NOT_READY',busyReason:'restoring_microsoft',retryable:true,retryAfterMs:250,recovery:'wait_once'})});
 await tab.get('codexForm').onsubmit({preventDefault(){}});
 await assert.rejects(bridge.request(bridge.list()[0].sessionId,'read',{}),{code:'EDITOR_NOT_READY',busyReason:'restoring_microsoft',retryable:true,retryAfterMs:250,recovery:'wait_once'});
 assert.equal(tab.stats.reads,1);
});
