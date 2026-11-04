// Pure snapshot analysis. No editor mutations, network, file access or client data.
import {BATCH_LIMIT} from './contract.mjs';
export { PROTOCOL_VERSION, TOOL_CONTRACT, BATCH_LIMIT, BATCH_OPERATIONS, BPMN_CREATE_TYPES, EVENT_KINDS } from './contract.mjs';
const containers = new Set(['bpmn:Participant', 'bpmn:Lane', 'bpmn:Group', 'bpmn:TextAnnotation', 'bpmn:Collaboration', 'bpmn:Process']);
const conditional = new Set(['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway', 'bpmn:ComplexGateway']);
import {same,pointEqual,segments,segmentContact,lineHitsBox,boxesOverlap} from './geometry.mjs';
export {segments,segmentContact,lineHitsBox,boxesOverlap} from './geometry.mjs';
export {SIDES,anchorPolicy,anchorPoint,inferAnchor,routeMetrics,simplifyOrthogonal,orthogonalizeWaypoints,routeOrthogonal} from './routing.mjs';
import {reviewVisualQuality} from './quality.mjs';
import {intentionalSharedContact} from './connection-editing.mjs';
export {projectRoute,planReconnectPreview,planMovedRoutes,shareConnectionTail,shareConnectionPath,intentionalSharedContact} from './connection-editing.mjs';
export {reviewVisualQuality} from './quality.mjs';
export {LANE_BORDER_CLEARANCE,laneBoundaries,laneRouteConflicts} from './lane-routing.mjs';
export function validateSnapshot(snapshot, { profile = 'review', geometry = true, maxIssues = 200 } = {}) {
  if (!['review', 'formal'].includes(profile)) throw Error('profile must be review or formal');
  const issues = [], seen = new Set(); let detected = 0, errors = 0, warnings = 0;
  const add = (code, severity, ids, message, extra = {}) => { const key = code + ':' + [...ids].sort().join(','); if (seen.has(key)) return; seen.add(key); detected++; if (severity === 'error') errors++; else warnings++; if (issues.length < maxIssues) issues.push({ code, severity, elementIds: ids, message, ...extra }); };
  const elements = snapshot.elements || [], index = new Map(elements.map(e => [e.id, e]));
  const coverage = { geometryRequested: geometry, missingFigureBounds: [], missingRoutes: [], missingLabelBounds: [] };
  const source = Object.fromEntries(['fileName', 'revision', 'sha256', 'activeSheetId', 'editorVersion', 'editorBuild'].filter(key => snapshot[key] !== undefined).map(key => [key, snapshot[key]]));
  if (snapshot.elementsTruncated || snapshot.elementsFiltered) add('INCOMPLETE_SNAPSHOT', 'error', [], 'La lectura está truncada o filtrada; no se puede declarar validación completa.');
  if (snapshot.unappliedProperties) add('FORM_PENDING', 'warning', snapshot.selectedIds || [], 'Hay propiedades sin aplicar; esta revisión analiza el modelo confirmado.');
  for (const warning of snapshot.warnings || []) add('IMPORT_WARNING', 'warning', [], String(warning));
  if (snapshot.diagramType === 'erd') {
    const model = snapshot.dataModel || {}, tables = new Map((model.tables || []).map(t => [t.id, t]));
    for (const table of tables.values()) {
      const names = new Set(); for (const field of table.fields || []) { if (names.has(field.name)) add('DUPLICATE_FIELD', 'error', [table.id, field.id], 'Nombre de campo repetido.'); names.add(field.name); }
    }
    for (const relation of model.relationships || []) for (const side of ['source', 'target']) {
      if (!tables.get(relation[side + 'TableId'])?.fields.some(f => f.id === relation[side + 'FieldId'])) add('DANGLING_RELATIONSHIP', 'error', [relation.id], 'La relación tiene un extremo inexistente.');
    }
  } else {
    const groups = new Map();
    for (const e of elements) {
      for (const definition of e.eventDefinitions || []) {
        if (definition.type === 'bpmn:LinkEventDefinition') {
          if (!definition.name?.trim()) { add('LINK_NAME_MISSING', 'error', [e.id], 'Falta el nombre interno del enlace.'); continue; }
          const key = (e.flowScopeId || e.parentId || '') + ':' + definition.name;
          const group = groups.get(key) || []; group.push(e); groups.set(key, group);
        }
        if (definition.type === 'bpmn:TimerEventDefinition' && !['timeDate', 'timeDuration', 'timeCycle'].some(k => definition[k]?.body?.trim())) add('TIMER_VALUE_MISSING', 'error', [e.id], 'Falta el valor del temporizador.');
        if (definition.type === 'bpmn:ConditionalEventDefinition' && !definition.condition?.body?.trim()) add('EVENT_CONDITION_MISSING', 'error', [e.id], 'Falta la condición del evento.');
      }
      if (e.type === 'bpmn:SequenceFlow') {
        const source = index.get(e.sourceId), target = index.get(e.targetId);
        if (!source || !target) add('DANGLING_FLOW', 'error', [e.id], 'La conexión tiene un extremo inexistente.');
        else if (source.flowScopeId && target.flowScopeId && source.flowScopeId !== target.flowScopeId) add('SEQUENCE_CROSSES_SCOPE', 'error', [e.id, source.id, target.id], 'Un flujo de secuencia cruza procesos o subprocesos.');
        if (source?.defaultFlowId === e.id && e.condition?.body) add('DEFAULT_HAS_CONDITION', 'error', [e.id], 'La salida predeterminada no debe tener condición.');
        if (['bpmn:ParallelGateway', 'bpmn:EventBasedGateway'].includes(source?.type) && e.condition?.body) add('UNSUPPORTED_FLOW_CONDITION', 'error', [e.id, source.id], 'Esta compuerta no evalúa condiciones en sus salidas.');
      }
      if (conditional.has(e.type)) {
        const outgoing = elements.filter(f => f.type === 'bpmn:SequenceFlow' && f.sourceId === e.id);
        if (e.defaultFlowId && !outgoing.some(f => f.id === e.defaultFlowId)) add('INVALID_DEFAULT_FLOW', 'error', [e.id], 'La salida predeterminada no pertenece a esta compuerta.');
        if (outgoing.length > 1) for (const f of outgoing) if (f.id !== e.defaultFlowId && !f.condition?.body?.trim()) add('BRANCH_CONDITION_MISSING', profile === 'formal' ? 'error' : 'warning', [e.id, f.id], 'La rama tiene una etiqueta, pero no una condición BPMN formal.');
      }
    }
    for (const group of groups.values()) {
      const catches = group.filter(e => e.type === 'bpmn:IntermediateCatchEvent'), throws = group.filter(e => e.type === 'bpmn:IntermediateThrowEvent'), ids = group.map(e => e.id);
      if (catches.length > 1) add('DUPLICATE_LINK_CATCH', 'error', ids, 'Hay varias entradas con igual nombre interno en el mismo ámbito.');
      if (!catches.length || !throws.length) add('INCOMPLETE_LINK_PAIR', profile === 'formal' ? 'error' : 'warning', ids, 'Falta la entrada o la salida del enlace en el mismo proceso o subproceso.');
    }
  }
  if (geometry) {
    for (const e of elements) {
      const connection = /(?:Flow|Association|Relationship)$/.test(e.type) || Boolean(e.sourceId || e.targetId);
      if (connection && !(e.waypoints?.length > 1 && e.waypoints.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))) coverage.missingRoutes.push(e.id);
      else if (!connection && !containers.has(e.type) && !(Number.isFinite(e.x) && Number.isFinite(e.y) && e.width > 0 && e.height > 0)) coverage.missingFigureBounds.push(e.id);
      const external = e.externalLabelExpected ?? (Boolean(e.name?.trim()) && /(?:Event|Gateway|Flow|Reference)$/.test(e.type));
      if (external && !(e.labelBounds && Number.isFinite(e.labelBounds.x) && Number.isFinite(e.labelBounds.y) && e.labelBounds.width > 0 && e.labelBounds.height > 0)) coverage.missingLabelBounds.push(e.id);
    }
    for (const [key, message] of [['missingFigureBounds', 'Faltan límites de figuras.'], ['missingRoutes', 'Faltan recorridos completos.'], ['missingLabelBounds', 'Faltan límites de etiquetas externas.']]) if (coverage[key].length) add('GEOMETRY_UNAVAILABLE', 'warning', coverage[key], message + ' La revisión geométrica es parcial.', { coverage: key });
    const nodes = elements.filter(e => Number.isFinite(e.x) && Number.isFinite(e.y) && e.width > 0 && e.height > 0 && !containers.has(e.type) && !e.waypoints);
    const flows = elements.filter(e => e.waypoints?.length > 1), labels = elements.filter(e => e.labelBounds && !['bpmn:Group', 'bpmn:Lane', 'bpmn:Participant'].includes(e.type));
    const ancestors = e => { const ids = new Set(); for (let p = index.get(e.parentId); p && !ids.has(p.id); p = index.get(p.parentId)) ids.add(p.id); return ids; };
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.attachedToId !== b.id && b.attachedToId !== a.id && !ancestors(a).has(b.id) && !ancestors(b).has(a.id) && boxesOverlap(a, b)) add('FIGURE_OVERLAP', 'warning', [a.id, b.id], 'Las figuras se superponen.');
    }
    for(const f of flows){
      const owners=ancestors(f);
      for(const n of nodes){
        if(owners.has(n.id)){if((f.waypoints||[]).some(p=>p.x<n.x-.1||p.x>n.x+n.width+.1||p.y<n.y-.1||p.y>n.y+n.height+.1))add('FLOW_OUTSIDE_SCOPE','error',[f.id,n.id],'El recorrido sale de su subproceso contenedor.');continue;}
        if(![f.sourceId,f.targetId].includes(n.id)&&segments(f).some(([a,b])=>lineHitsBox(a,b,n)))add('FLOW_THROUGH_FIGURE','error',[f.id,n.id],'La línea atraviesa una figura ajena.');
      }
    }
    for (let i = 0; i < flows.length; i++) for (let j = i + 1; j < flows.length; j++) {
      const a = flows[i], b = flows[j];
      for (const [p, q] of segments(a)) for (const [r, s] of segments(b)) {
        const hit = segmentContact(p, q, r, s); if (!hit) continue;
        if(intentionalSharedContact(a,b,p,q,r,s,hit))continue;
        const shared = [a.sourceId, a.targetId].some(id => id && [b.sourceId, b.targetId].includes(id));
        const endpoint = f => hit.point && [f.waypoints[0], f.waypoints.at(-1)].some(p => pointEqual(p, hit.point));
        if (hit.type === 'contact' && shared && endpoint(a) && endpoint(b)) continue;
        add(hit.type === 'overlap' ? 'LINE_OVERLAP' : hit.type === 'crossing' ? 'LINE_CROSSING' : 'UNINTENDED_CONTACT', 'warning', [a.id, b.id], 'Las conexiones se superponen, cruzan o se tocan fuera de un extremo compartido.', hit.point ? { point: hit.point } : {});
      }
    }
    for (let i = 0; i < labels.length; i++) {
      const e = labels[i], bounds = e.labelBounds;
      for (const f of flows) if (segments(f).some(([a, b]) => lineHitsBox(a, b, bounds))) add('LABEL_OVER_LINE', 'warning', [e.id, f.id], 'Una etiqueta se superpone a una línea.');
      for (const n of nodes) if (n.id !== e.id && boxesOverlap(bounds, n)) add('LABEL_OVER_FIGURE', 'warning', [e.id, n.id], 'Una etiqueta se superpone a una figura.');
      for (const other of labels.slice(i + 1)) if (boxesOverlap(bounds, other.labelBounds)) add('LABEL_OVERLAP', 'warning', [e.id, other.id], 'Dos etiquetas se superponen.');
    }
  }
  return { source, coverage, profile, valid: errors === 0, complete: !snapshot.elementsTruncated && !snapshot.elementsFiltered && detected <= maxIssues && !Object.values(coverage).some(value => Array.isArray(value) && value.length), issues, totalIssues: detected, errors, warnings, quality:geometry?reviewVisualQuality(snapshot,{maxIssues}):undefined,scope: 'active-sheet', businessApproval: false };
}
export function compareSnapshots(before, after) {
  const previous = new Map((before.elements || []).map(e => [e.id, e])), current = new Map((after.elements || []).map(e => [e.id, e]));
  const fields = ['type', 'name', 'documentation', 'parentId', 'flowScopeId', 'sourceId', 'targetId', 'x', 'y', 'width', 'height', 'waypoints', 'labelBounds', 'semanticProperties', 'defaultFlowId', 'condition', 'eventDefinitions','visualStyle','routing'];
  return { added: [...current.keys()].filter(id => !previous.has(id)), removed: [...previous.keys()].filter(id => !current.has(id)), changed: [...previous].filter(([id]) => current.has(id)).map(([id, a]) => ({ id, fields: fields.filter(key => JSON.stringify(a[key]) !== JSON.stringify(current.get(id)[key])) })).filter(e => e.fields.length) };
}
export function planOperations(snapshot, operations) {
  const state = new Map((snapshot.elements || []).map(e => [e.id, structuredClone(e)])), result = [], skipped = [];
  for (const [i, operation] of operations.entries()) {
    const e = state.get(operation.elementId), op = structuredClone(operation); let noOp = false;
    if (e) {
      if (op.type === 'label') { noOp = e.name === op.text && (!op.bounds || JSON.stringify(e.labelBounds) === JSON.stringify(op.bounds)); e.name = op.text; if (op.bounds) e.labelBounds = op.bounds; }
      if (op.type === 'documentation') { noOp = e.documentation === op.text; e.documentation = op.text; }
      if (op.type === 'route') { noOp = JSON.stringify(e.waypoints) === JSON.stringify(op.waypoints); e.waypoints = op.waypoints; }
      if (op.type === 'move' && !op.parentId) { noOp = op.dx === 0 && op.dy === 0; e.x += op.dx; e.y += op.dy; }
      if (op.type === 'properties') { noOp = Object.entries(op.values).every(([key, value]) => e.semanticProperties?.[key] === value); e.semanticProperties = { ...e.semanticProperties, ...op.values }; }
    }
    if (noOp) skipped.push(i); else {
      result.push(op);
      // Native moves, properties and creation can change other objects/routes.
      // Stop inferring later no-ops from a state we can no longer project exactly.
      if (!['label', 'documentation', 'route'].includes(op.type)) state.clear();
      else if (op.type === 'route' && e) delete e.labelBounds;
    }
  }
  return { sourceRevision: snapshot.revision, originalCount: operations.length, operations: result, skippedIndices: skipped, batchSizeLimit: BATCH_LIMIT };
}
export {planContainerFit} from './layout.mjs';
