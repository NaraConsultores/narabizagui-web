import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import * as audit from '../plugins/naraflows/shared/audit.mjs';
import { bpmnArtifact } from '../plugins/naraflows/server/bpmn-file.mjs';

const sources = await Promise.all(['editor-structure.js', 'editor-operations.js'].map(name => readFile(new URL('../' + name, import.meta.url), 'utf8')));
const sizes = { 'bpmn:StartEvent': [36, 36], 'bpmn:EndEvent': [36, 36], 'bpmn:ExclusiveGateway': [50, 50], 'bpmn:ParallelGateway': [50, 50], 'bpmn:Participant': [600, 250] };

// Minimal modeler double: native geometry and the bpmn-js collaboration-to-process morph.
function fixture({ routeError } = {}) {
  let counter = 0;
  const registry = new Map(), handlers = {}, definitions = { $type: 'bpmn:Definitions', rootElements: [] };
  const add = e => { registry.set(e.id, e); return e; };
  const attach = (e, parent) => { if (e.parent) e.parent.children = e.parent.children.filter(c => c !== e); e.parent = parent; parent.children.push(e); };
  const makeRoot = (type, bo) => { const root = add({ id: bo.id, type, businessObject: bo, children: [] }); definitions.rootElements = [bo]; return root; };
  let root = makeRoot('bpmn:Collaboration', { $type: 'bpmn:Collaboration', id: 'Collaboration_Generic', name: 'Hoja genérica', participants: [] });
  const bpmnFactory = { create: (type, attrs = {}) => ({ $type: type, id: attrs.id || type.slice(5) + '_' + ++counter, ...attrs }) };
  const shapeOf = ({ type, businessObject, width, height }) => { const [w, h] = sizes[type] || [100, 80]; return { id: businessObject.id, type, businessObject, width: width ?? w, height: height ?? h, children: [], di: {} }; };
  const findRoot = e => { while (e.parent) e = e.parent; return e; };
  const remove = e => { for (const child of [...(e.children || [])]) remove(child); if (e.parent) e.parent.children = e.parent.children.filter(c => c !== e); registry.delete(e.id); if (e.type === 'bpmn:Participant') root.businessObject.participants = root.businessObject.participants.filter(p => p !== e.businessObject); };
  const modeling = {
    createShape(shape, { x, y }, parent) { Object.assign(shape, { x: x - shape.width / 2, y: y - shape.height / 2 }); add(shape); attach(shape, parent); if (shape.type === 'bpmn:Participant') root.businessObject.participants.push(shape.businessObject); return shape; },
    resizeShape: (shape, bounds) => Object.assign(shape, bounds),
    updateLabel: (e, text) => { e.businessObject.name = text; },
    splitLane(pool, count) { for (let i = 0; i < count; i++) { const lane = add({ id: 'Lane_' + ++counter, type: 'bpmn:Lane', businessObject: bpmnFactory.create('bpmn:Lane'), x: pool.x + 30, y: pool.y + i * pool.height / count, width: pool.width - 30, height: pool.height / count, children: [] }); attach(lane, pool); } },
    connect(source, target) { const c = add({ id: 'Flow_' + ++counter, type: 'bpmn:SequenceFlow', businessObject: bpmnFactory.create('bpmn:SequenceFlow', { name: '' }), source, target, waypoints: [{ x: source.x, y: source.y }, { x: target.x, y: target.y }], children: [] }); attach(c, source.parent); return c; },
    removeElements(list) {
      const hadParticipant = list.some(e => e.type === 'bpmn:Participant');
      for (const e of list) if (registry.has(e.id)) remove(e);
      if (hadParticipant && root.type === 'bpmn:Collaboration' && !root.businessObject.participants.length) {
        const children = root.children; registry.delete(root.id);
        root = makeRoot('bpmn:Process', bpmnFactory.create('bpmn:Process')); children.forEach(child => attach(child, root));
      }
    }
  };
  const services = {
    modeling, bpmnFactory, rules: { allowed: () => true },
    elementFactory: { createShape: shapeOf, createParticipantShape: ({ businessObject, isExpanded }) => { businessObject.processRef = bpmnFactory.create('bpmn:Process'); return { ...shapeOf({ type: 'bpmn:Participant', businessObject }), di: { isExpanded } }; } },
    canvas: { getRootElement: () => root, findRoot },
    elementRegistry: { get: id => registry.get(id), getAll: () => [...registry.values()], filter: fn => [...registry.values()].filter(fn) },
    commandStack: { registerHandler: (name, Handler) => { handlers[name] = Handler; }, execute: (name, context) => { const handler = new handlers[name](modeling); handler.preExecute?.(context); handler.execute?.(context); } }
  };
  const modeler = { get: key => services[key], getDefinitions: () => definitions };
  const window = { NaraModelAudit: audit, NaraBpmnProperties: { create: () => ({}) }, NaraVisual: { create: () => ({ orthogonal() { if (routeError) throw Object.assign(Error('No se encontró un recorrido ortogonal local libre.'), { code: 'ROUTE_BLOCKED' }); } }) } };
  const context = vm.createContext({ window });
  for (const source of sources) vm.runInContext(source, context);
  return { runner: window.NaraMcpOperations.create(modeler), registry, root: () => root };
}
const plain = value => JSON.parse(JSON.stringify(value));
const matrix = extra => ({ type: 'matrix', name: 'Ciclo genérico', x: 100, y: 140, width: 1260, rowHeight: 200, lanes: ['Área solicitante', 'Área revisora'], stages: ['Recepción', 'Revisión', 'Cierre'], ...extra });

test('matrix sizes activities in the documented cell geometry and keeps the 100×80 default', () => {
  const f = fixture();
  const { aliases } = f.runner.run([matrix({ activitySize: { width: 220, height: 100 }, activities: [
    { key: 'receive', name: 'Recibir solicitud', lane: 1, stage: 1 },
    { key: 'review', name: 'Revisar solicitud', lane: 2, stage: 2, width: 180, height: 90, xOffset: 20 },
    { key: 'end', bpmnType: 'bpmn:EndEvent', lane: 2, stage: 3 }
  ] })]);
  const stageWidth = (1260 - 60) / 3, center = (stage, lane) => ({ x: 100 + 60 + stageWidth * (stage - .5), y: 140 + 200 * (lane - .5) });
  const middle = e => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });
  const receive = f.registry.get(aliases.receive), review = f.registry.get(aliases.review), end = f.registry.get(aliases.end);
  assert.deepEqual([receive.width, receive.height], [220, 100]); assert.deepEqual(middle(receive), center(1, 1));
  assert.deepEqual([review.width, review.height], [180, 90]); assert.deepEqual(middle(review), { x: center(2, 2).x + 20, y: center(2, 2).y });
  assert.deepEqual([end.width, end.height], [36, 36]);
  const legacy = fixture(), { aliases: legacyAliases } = legacy.runner.run([matrix({ activities: [{ key: 'task', lane: 1, stage: 1 }] })]), task = legacy.registry.get(legacyAliases.task);
  assert.deepEqual([task.width, task.height], [100, 80]); assert.deepEqual(middle(task), center(1, 1));
});

test('matrix rejects sizes on events and names the activity that does not fit its cell', () => {
  assert.throws(() => fixture().runner.run([matrix({ activities: [{ key: 'start', bpmnType: 'bpmn:StartEvent', lane: 1, stage: 1, width: 120 }] })]), error => error.failedOperation.alias === 'start' && /solo se aplican a actividades/.test(error.message));
  assert.throws(() => fixture().runner.run([matrix({ activities: [{ key: 'wide', lane: 1, stage: 2, width: 600 }] })]), error => {
    assert.equal(error.code, 'INVALID_STRUCTURE'); assert.deepEqual({ index: error.failedOperation.index, type: error.failedOperation.type, alias: error.failedOperation.alias }, { index: 0, type: 'matrix', alias: 'wide' });
    assert.deepEqual(plain(error.failedOperation.cell), { x: 560, y: 140, width: 400, height: 200 }); assert.match(error.message, /^Operación 1 \(matrix · wide\): La figura wide \(600×80\)/); return true;
  });
});

test('matrix links accept branch aliases and labels and reject reserved or repeated names', () => {
  const f = fixture();
  const { aliases } = f.runner.run([matrix({ activities: [
    { key: 'check', name: '¿Está completo?', bpmnType: 'bpmn:ExclusiveGateway', lane: 2, stage: 2 },
    { key: 'close', name: 'Cerrar', lane: 2, stage: 3 }, { key: 'fix', name: 'Completar', lane: 1, stage: 2 }
  ], links: [{ from: 'check', to: 'close', as: 'yes', label: 'Sí' }, { from: 'check', to: 'fix', as: 'no', label: 'No' }] })]);
  assert.equal(f.registry.get(aliases.yes).businessObject.name, 'Sí'); assert.equal(f.registry.get(aliases.no).source.id, aliases.check);
  for (const as of ['lane1', 'check'])
    assert.throws(() => fixture().runner.run([matrix({ activities: [{ key: 'check', lane: 1, stage: 1 }, { key: 'next', lane: 1, stage: 2 }], links: [{ from: 'check', to: 'next', as }] })]), error => error.failedOperation.alias === as);
});

test('aliases explain matrix reservations and failures name the operation, element and alias', () => {
  assert.throws(() => fixture().runner.run([{ ...matrix(), as: 'main' }]), error => error.failedOperation.alias === 'main' && /matrix no admite as/.test(error.message));
  assert.throws(() => fixture().runner.run([matrix(), { type: 'connect', sourceId: '@lane1', targetId: '@lane2', as: 'stage1' }]), error => error.failedOperation.index === 1 && /Alias repetido: stage1/.test(error.message));
  const f = fixture({ routeError: true });
  assert.throws(() => f.runner.run([matrix({ activities: [{ key: 'a', lane: 1, stage: 1 }, { key: 'b', lane: 2, stage: 2 }], links: [{ from: 'a', to: 'b', as: 'flow' }] }), { type: 'route_orthogonal', elementId: '@flow' }]), error => {
    assert.equal(error.code, 'ROUTE_BLOCKED'); assert.equal(error.failedOperation.type, 'route_orthogonal'); assert.equal(error.failedOperation.alias, 'flow');
    assert.match(error.failedOperation.elementId, /^Flow_/); assert.ok(error.message.includes(error.failedOperation.elementId)); return true;
  });
});

test('clear keeps the sheet name, collaboration and process IDs, and the next matrix reuses its pool', () => {
  const f = fixture(), sheetId = f.root().id;
  const first = f.runner.run([matrix({ activities: [{ key: 'task', lane: 1, stage: 1 }] })]), processId = first.sheet.processId;
  assert.deepEqual(plain(first.sheet), { id: sheetId, name: 'Hoja genérica', processId });
  const cleared = f.runner.run([{ type: 'clear', scope: 'active' }]);
  assert.equal(cleared.sheet.preserved, true); assert.equal(cleared.sheet.keptParticipantId, first.aliases.pool); assert.equal(f.root().id, sheetId);
  assert.deepEqual(f.root().children.map(e => e.id), [first.aliases.pool]); assert.equal(f.registry.get(first.aliases.pool).children.length, 0);
  const second = f.runner.run([matrix({ activities: [{ key: 'again', lane: 2, stage: 3 }] })]);
  assert.equal(second.aliases.pool, first.aliases.pool); assert.deepEqual(plain(second.sheet), { id: sheetId, name: 'Hoja genérica', processId });
});

test('clear reports the previous identity when bpmn-js has to replace the sheet root', () => {
  const f = fixture();
  f.runner.run([matrix()]); f.registry.get(f.root().children.find(e => e.type === 'bpmn:Participant').id).di.isExpanded = false;
  const { sheet } = f.runner.run([{ type: 'clear', scope: 'active' }]);
  assert.equal(sheet.preserved, false); assert.equal(sheet.previous.name, 'Hoja genérica'); assert.equal(sheet.previous.id, 'Collaboration_Generic'); assert.notEqual(sheet.id, sheet.previous.id);
});

test('export_bpmn writes the complete XML to a temporary file with its hash instead of returning it', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'naraflows-export-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const xml = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs"/>', sha256 = createHash('sha256').update(xml).digest('hex');
  const state = { revision: 'r7', sha256, xml, fileName: 'Proceso genérico.bpmn', activeSheetId: 'Collaboration_Generic', sheets: [{ id: 'Collaboration_Generic', name: 'Hoja genérica', kind: 'process', processId: 'Process_1', elementId: 'ignored' }] };
  const result = await bpmnArtifact(state, { expectedRevision: 'r7', directory });
  assert.equal(result.sha256, sha256); assert.equal(result.matchesEditorSha256, true); assert.equal(result.saved, false); assert.equal('xml' in result, false);
  assert.equal(await readFile(result.filePath, 'utf8'), xml); assert.equal(path.dirname(result.filePath), directory); assert.deepEqual(result.sheets, [{ id: 'Collaboration_Generic', name: 'Hoja genérica', kind: 'process', processId: 'Process_1' }]);
  await assert.rejects(bpmnArtifact(state, { expectedRevision: 'r6', directory }), { code: 'REVISION_CONFLICT' });
  await assert.rejects(bpmnArtifact({ ...state, xml: undefined }, { directory }), { code: 'BPMN_EXPORT_ERROR' });
});
