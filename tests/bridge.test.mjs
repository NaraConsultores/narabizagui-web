import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startBridge, VERSION } from '../plugins/narabizagui/server/bridge.mjs';

const origin = 'https://demo.naraconsultores.com';
async function post(port, route, data, token, extra = {}) {
  return fetch(`http://127.0.0.1:${port}${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: JSON.stringify(data) });
}
async function pair(bridge) {
  const code = bridge.pair().pairingCode.split('.')[1];
  const response = await post(bridge.port, '/pair', { code, name: 'Prueba genérica' });
  assert.equal(response.status, 200);
  return { code, ...(await response.json()) };
}

test('loopback rejects foreign origins, rebinding, absent auth, reused and expired codes', async t => {
  let currentTime = Date.now();
  const bridge = await startBridge({ pairingTtlMs: 50, now: () => currentTime });
  t.after(() => bridge.close());
  const { code, sessionId, sessionToken } = await pair(bridge);
  assert.equal((await post(bridge.port, '/pair', { code })).status, 401);
  assert.equal((await post(bridge.port, `/sessions/${sessionId}/poll`, {}, null)).status, 401);
  assert.equal((await post(bridge.port, `/sessions/${sessionId}/poll`, {}, sessionToken, { Origin: 'https://foreign.example' })).status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: bridge.port, path: '/pair', method: 'POST', headers: { Host: `evil.example:${bridge.port}`, Origin: origin, 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end('{}');
  });
  assert.equal(rebindingStatus, 403);
  const expired = bridge.pair().pairingCode.split('.')[1];
  currentTime += 65;
  assert.equal((await post(bridge.port, '/pair', { code: expired })).status, 401);
});

test('commands require matching confirmation and are never delivered twice', async t => {
  const bridge = await startBridge();
  t.after(() => bridge.close());
  const session = await pair(bridge);
  const pending = bridge.request(session.sessionId, 'edit', { expectedRevision: 'r1' });
  const poll = await (await post(bridge.port, `/sessions/${session.sessionId}/poll`, {}, session.sessionToken)).json();
  assert.equal(poll.command.action, 'edit');
  await assert.rejects(bridge.request(session.sessionId, 'edit', {}), { code: 'BUSY' });
  assert.equal((await post(bridge.port, `/sessions/${session.sessionId}/result`, { commandId: 'wrong', result: {} }, session.sessionToken)).status, 409);
  const res = await post(bridge.port, `/sessions/${session.sessionId}/result`, { commandId: poll.command.id, result: { applied: true, revision: 'r2' } }, session.sessionToken);
  assert.equal(res.status, 200);
  assert.deepEqual(await pending, { applied: true, revision: 'r2' });
  assert.equal((await post(bridge.port, `/sessions/${session.sessionId}/result`, { commandId: poll.command.id, result: {} }, session.sessionToken)).status, 409);
  bridge.disconnect(session.sessionId);
  await assert.rejects(bridge.request(session.sessionId, 'read', {}), { code: 'NOT_CONNECTED' });
});

test('timeout distinguishes undelivered from an unconfirmed result and expires the queue', async t => {
  const bridge = await startBridge({ timeoutMs: 70 });
  t.after(() => bridge.close());
  const session = await pair(bridge);
  await assert.rejects(bridge.request(session.sessionId, 'edit', {}), { code: 'NOT_RESPONDING' });
  const pending = bridge.request(session.sessionId, 'edit', {});
  const assertion = assert.rejects(pending, { code: 'RESULT_UNKNOWN' });
  const poll = await (await post(bridge.port, `/sessions/${session.sessionId}/poll`, {}, session.sessionToken)).json();
  assert.equal(poll.command.action, 'edit');
  await assertion;
  assert.equal((await post(bridge.port, `/sessions/${session.sessionId}/result`, { commandId: poll.command.id, result: {} }, session.sessionToken)).status, 409);
});

test('batch timing separates bridge transport from editor measurements',async t=>{
 const bridge=await startBridge();t.after(()=>bridge.close());const session=await pair(bridge);
 const pending=bridge.request(session.sessionId,'editBatch',{}),poll=await(await post(bridge.port,`/sessions/${session.sessionId}/poll`,{},session.sessionToken)).json();
 await post(bridge.port,`/sessions/${session.sessionId}/result`,{commandId:poll.command.id,result:{applied:true,timings:{applyMs:3}}},session.sessionToken);
 const result=await pending;assert.equal(result.timings.applyMs,3);assert.ok(result.timings.transport.queueMs>=0);assert.ok(result.timings.transport.roundTripMs>=result.timings.transport.queueMs);assert.equal('firstVisibleMs'in result.timings,false);
});

test('bundled plugin starts outside the checkout without npm install and serves real MCP', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'narabizagui-plugin-'));
  const plugin = path.join(dir, 'plugin');
  await cp(new URL('../plugins/narabizagui/', import.meta.url), plugin, { recursive: true });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(plugin, 'server/dist/server.mjs')], cwd: dir, stderr: 'pipe' });
  const client = new Client({ name: 'narabizagui-qa', version: '1.0.0' });
  t.after(async () => {
    await client.close();
    if (path.dirname(dir) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('narabizagui-plugin-')) throw new Error('Unexpected temporary cleanup target');
    await rm(dir, { recursive: true, force: true });
  });
  await client.connect(transport);
  const discovered = (await client.listTools()).tools;
  assert.equal(discovered.length, 17);
  for (const suffix of ['status','resolve','list','create','open','attach','autosave']) assert.ok(discovered.some(tool=>tool.name==='narabizagui_microsoft_'+suffix));
  const editSchema=JSON.stringify(discovered.find(tool=>tool.name==='narabizagui_edit').inputSchema);
  for(const operation of ['matrix','clear','fit','lane_split','lane_add','style','delete','fit_text','route_orthogonal','share_connection','compact_container'])assert.ok(editSchema.includes('"'+operation+'"'),'Missing structural operation '+operation);
  assert.ok(JSON.stringify(discovered.find(tool=>tool.name==='narabizagui_read').inputSchema).includes('summary'));
  assert.ok(discovered.some(tool=>tool.name==='narabizagui_validate'));
  assert.ok(discovered.some(tool=>tool.name==='narabizagui_edit_batch'));
  const editInput=discovered.find(tool=>tool.name==='narabizagui_edit').inputSchema;assert.deepEqual(editInput.properties.response.enum,['full','summary']);
  for(const field of ['activitySize','"label"','"height"'])assert.ok(editSchema.includes(field),'Missing matrix field '+field);
  assert.ok(JSON.stringify(discovered.find(tool=>tool.name==='narabizagui_export_bpmn').inputSchema).includes('expectedRevision'));
  const connection = (await client.callTool({ name: 'narabizagui_connect', arguments: {} })).structuredContent;
  assert.equal(connection.toolContract,'visual-quality-v1');assert.equal(connection.serverVersion,VERSION);
  const [port, code] = connection.pairingCode.split('.');
  const paired = await (await post(port, '/pair', { code })).json();
  const sessions = (await client.callTool({ name: 'narabizagui_sessions', arguments: {} })).structuredContent.sessions;
  assert.equal(sessions[0].sessionId, paired.sessionId);
  const pending = client.callTool({ name: 'narabizagui_read', arguments: { sessionId: paired.sessionId } });
  const poll = await (await post(port, `/sessions/${paired.sessionId}/poll`, {}, paired.sessionToken)).json();
  await post(port, `/sessions/${paired.sessionId}/result`, { commandId: poll.command.id, result: { revision: 'test', dirty: false } }, paired.sessionToken);
  assert.equal((await pending).structuredContent.revision, 'test');
  const autoSession=client.callTool({name:'narabizagui_read',arguments:{waitForReadyMs:0}});
  const autoPoll=await(await post(port,`/sessions/${paired.sessionId}/poll`,{},paired.sessionToken)).json();
  assert.equal(autoPoll.command.args.detail,'summary');
  await post(port,`/sessions/${paired.sessionId}/result`,{commandId:autoPoll.command.id,result:{revision:'auto',documentReady:true}},paired.sessionToken);
  assert.equal((await autoSession).structuredContent.sessionId,paired.sessionId);
  const nextConnection=(await client.callTool({name:'narabizagui_connect',arguments:{}})).structuredContent;
  const [nextPort,nextCode]=nextConnection.pairingCode.split('.');await post(nextPort,'/pair',{code:nextCode});
  const ambiguous=await client.callTool({name:'narabizagui_read',arguments:{}});assert.equal(ambiguous.isError,true);assert.equal(JSON.parse(ambiguous.content[0].text).code,'AMBIGUOUS_SESSION');
  const bad = await client.callTool({ name: 'narabizagui_edit', arguments: { sessionId: paired.sessionId, operation: { type: 'delete', elementId: 'x' } } });
  assert.equal(bad.isError, true, 'An edit without a base revision must be rejected by the MCP schema');
});

test('resuming rotates the credential; a copied old credential cannot disconnect the restored tab',async t=>{
 const b=await startBridge();t.after(()=>b.close());const code=b.pair().pairingCode.split('.')[1];
 const paired=await (await post(b.port,'/pair',{code,name:'Generic'})).json();
 const resumed=await (await post(b.port,'/sessions/'+paired.sessionId+'/resume',{generation:1},paired.sessionToken)).json();
 assert.equal(resumed.generation,2);assert.notEqual(resumed.sessionToken,paired.sessionToken);
 assert.equal((await post(b.port,'/sessions/'+paired.sessionId+'/disconnect',{},paired.sessionToken)).status,401);
 assert.equal(b.list().length,1);
});
test('abandoned sessions expire without increasing the per-server session limit',async t=>{
 let now=10000;const b=await startBridge({now:()=>now,sessionTtlMs:1000});t.after(()=>b.close());
 const code=b.pair().pairingCode.split('.')[1];await post(b.port,'/pair',{code,name:'Generic'});assert.equal(b.list().length,1);now+=1001;assert.equal(b.list().length,0);
});
test('a mutation inherits the document of the confirmed read, not a different file advertised by polling',async t=>{
 const b=await startBridge();t.after(()=>b.close());const code=b.pair().pairingCode.split('.')[1];const p=await(await post(b.port,'/pair',{code,name:'A'})).json();const route='/sessions/'+p.sessionId;
 const reading=b.request(p.sessionId,'read',{});const cmd=await(await post(b.port,route+'/poll',{documentId:'doc-A'},p.sessionToken)).json();
 await post(b.port,route+'/result',{commandId:cmd.command.id,result:{documentId:'doc-A'}},p.sessionToken);await reading;
 const editing=b.request(p.sessionId,'edit',{expectedRevision:'r1'});const rejected=assert.rejects(editing,{code:'DOCUMENT_MISMATCH'});const next=await(await post(b.port,route+'/poll',{documentId:'doc-B'},p.sessionToken)).json();
 assert.equal(next.command.args.expectedDocumentId,'doc-A');await post(b.port,route+'/result',{commandId:next.command.id,error:{code:'DOCUMENT_MISMATCH',message:'Wrong file'}},p.sessionToken);await rejected;
});
