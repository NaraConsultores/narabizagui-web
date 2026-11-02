'use strict';
(() => {
  const { BPMN_CREATE_TYPES: types, BATCH_OPERATIONS: supported, EVENT_KINDS: eventKinds } = window.NaraModelAudit;
  const fail = message => { throw Object.assign(Error(message), { code: 'INVALID_OPERATION' }); };
  function create(modeler) {
    const modeling = modeler.get('modeling'), registry = modeler.get('elementRegistry'), canvas = modeler.get('canvas'), rules = modeler.get('rules');
    const semantic = window.NaraBpmnProperties.create(modeler);
    const structure=window.NaraMcpStructure?.create(modeler);
    const visual=window.NaraVisual?.create(modeler);
    function PositionLabel(modeling) { this.preExecute = c => { modeling.updateLabel(c.element, c.text, c.bounds); const label = c.element.label; if (label) modeling.moveShape(label, { x: c.bounds.x - label.x, y: c.bounds.y - label.y }); }; this.execute = this.revert = () => []; }
    PositionLabel.$inject = ['modeling'];
    modeler.get('commandStack').registerHandler('nara.block.label', PositionLabel);
    const element = id => { const e = registry.get(id); if (!e || e.labelTarget || canvas.findRoot(e) !== canvas.getRootElement()) fail('El elemento no existe en la hoja activa: ' + id); return e; };
    function propertyPlan(e, partial) {
      const description = semantic.describe(e), fields = new Map(description.fields.map(f => [f.key, f])), values = Object.fromEntries(description.fields.map(f => [f.key, f.value]));
      for (const [key, v] of Object.entries(partial)) {
        const field = fields.get(key); if (!field) fail('Propiedad no admitida para este elemento: ' + key);
        if (field.checkbox ? typeof v !== 'boolean' : typeof v !== 'string' || v.length > 20000) fail('Valor de propiedad inválido: ' + key);
        if (field.choices && !field.choices.some(([choice]) => choice === v)) fail('Opción no admitida: ' + key);
        values[key] = v;
      }
      return semantic.plan(e, values);
    }
    function apply(op) {
      let e;
      if(op.type==='matrix'||op.type==='clear'){
        if(!structure)fail('El editor necesita el módulo de estructura. Actualiza la pestaña conservando los cambios.');
        return structure[op.type](op);
      } else if (op.type === 'create') {
        if (!types.includes(op.bpmnType) || ![op.x,op.y].every(Number.isFinite)) fail('Tipo o posición inválidos.');
        const factory = modeler.get('elementFactory'), bpmnFactory = modeler.get('bpmnFactory');
        const bo = bpmnFactory.create(op.bpmnType, op.bpmnType === 'bpmn:TextAnnotation' ? { text: op.name || '' } : { name: op.name || '' });
        const kind = op.eventDefinition || (op.linkName !== undefined ? 'Link' : undefined);
        if (op.linkName !== undefined && (kind !== 'Link' || !op.linkName.trim())) fail('linkName requiere un evento de enlace y un nombre no vacío.');
        if (kind) {
          if (!eventKinds[op.bpmnType]?.includes(kind)) fail('Esta definición no es válida para el tipo de evento.');
          const definition = bpmnFactory.create('bpmn:' + kind + 'EventDefinition', kind === 'Link' ? { name: op.linkName || '' } : {});
          definition.$parent = bo; bo.eventDefinitions = [definition];
        }
        if(op.expanded!==undefined&&op.bpmnType!=='bpmn:SubProcess')fail('expanded solo se aplica a subprocesos.');
        const shape = op.bpmnType === 'bpmn:Participant' ? factory.createParticipantShape({ businessObject: bo, isExpanded: true }) : factory.createShape({ type: op.bpmnType, businessObject: bo,...(op.expanded!==undefined?{isExpanded:op.expanded}:{}) });
        const parent = op.parentId ? element(op.parentId) : canvas.getRootElement();
        if (!rules.allowed('shape.create', { shape, target: parent, position: { x: op.x, y: op.y } })) fail('No se permite crear la figura en ese contenedor.');
        if(op.autoResize===false&&parent.parent&&(op.x-shape.width/2<parent.x||op.x+shape.width/2>parent.x+parent.width||op.y-shape.height/2<parent.y||op.y+shape.height/2>parent.y+parent.height))fail('La figura debe caber en su contenedor cuando autoResize es false.');
        e = modeling.createShape(shape, { x: op.x, y: op.y }, parent,op.autoResize===false?{autoResize:false}:undefined);
      } else if (op.type === 'connect') {
        const source = element(op.sourceId), target = element(op.targetId), connection = op.bpmnType ? { type: op.bpmnType } : undefined;
        const allowed = rules.allowed('connection.create', { source, target, connection });
        if (!allowed || (connection && allowed.type && allowed.type !== connection.type)) fail('Conexión BPMN no admitida.');
        e = modeling.connect(source, target, connection);
      } else {
        e = element(op.elementId || op.elementIds?.[0]);
        if(op.type==='lane_split'||op.type==='lane_add'){
          if(!['bpmn:Participant','bpmn:Lane'].includes(e.type)||e.di?.isExpanded===false)fail('Selecciona un participante expandido o un carril.');
          if(op.type==='lane_split'){
            if(!Number.isInteger(op.count)||op.count<2||op.count>10||(e.di?.isHorizontal===false?e.width:e.height)<op.count*60)fail('El contenedor requiere al menos 60 unidades por carril.');
            structure.prepareLanes(e);
            modeling.splitLane(e,op.count);
          }else{if(!['top','bottom','left','right'].includes(op.location))fail('Posición de carril inválida.');structure.prepareLanes(e);e=modeling.addLane(e,op.location);}
        } else if(op.type==='style'){
          if(!visual)fail('Falta el módulo de formato.');visual.applyStyle(e,op.style);
        } else if(op.type==='fit_text'){
          if(!visual)fail('Falta el módulo de texto.');visual.fitText(e,op);
        } else if(op.type==='compact_container'){
          if(!visual)fail('Falta el módulo de tamaño.');visual.compactContainer(e,op);
        } else if(op.type==='route_orthogonal'){
          if(!visual||!e.waypoints)fail('Selecciona una conexión para calcular su recorrido.');visual.orthogonal(e,op);
        } else if(op.type==='share_connection'){
          const reference=element(op.withConnectionId);if(!visual||!e.waypoints||!reference.waypoints||![op.x,op.y].every(Number.isFinite)||!['source','target',undefined].includes(op.end))fail('Selecciona dos conexiones y un punto del tramo compartido.');visual.shareConnection(e,reference,{x:op.x,y:op.y},op.end||'target');
        } else if(op.type==='delete'){
          if(!op.cascade&&(e.incoming?.length||e.outgoing?.length||e.children?.some(child=>!child.labelTarget)))fail('La eliminación afecta conexiones o hijos. Declara cascade:true solo si todo ese conjunto está autorizado.');
          modeling.removeElements([e]);
        } else if (op.type === 'label') {
          if (op.bounds && !(e.label || ['bpmn:StartEvent','bpmn:EndEvent','bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent','bpmn:ExclusiveGateway','bpmn:InclusiveGateway','bpmn:ParallelGateway','bpmn:ComplexGateway','bpmn:EventBasedGateway','bpmn:SequenceFlow','bpmn:MessageFlow','bpmn:Association','bpmn:Group','bpmn:DataObjectReference','bpmn:DataStoreReference'].includes(e.type))) fail('La posición requiere una etiqueta externa.');
          if (e.type === 'bpmn:TextAnnotation') modeling.updateProperties(e, { text: op.text });
          else if (op.bounds) modeler.get('commandStack').execute('nara.block.label', { element: e, text: op.text, bounds: op.bounds });
          else modeling.updateLabel(e, op.text);
        } else if (op.type === 'documentation') modeling.updateProperties(e, { documentation: op.text ? [modeler.get('moddle').create('bpmn:Documentation', { text: op.text })] : [] });
        else if (op.type === 'properties') { const changes = propertyPlan(e, op.values); semantic.transaction(() => changes.forEach(change => change())); }
        else if (op.type === 'route') {
          if (!e.waypoints || !Array.isArray(op.waypoints) || op.waypoints.length < 2 || op.waypoints.length > 100 || op.waypoints.some(p => ![p.x,p.y].every(Number.isFinite))) fail('Recorrido inválido.');
          if(visual)visual.manualRoute(e,op.waypoints.map(p=>({x:p.x,y:p.y})));else modeling.updateWaypoints(e, op.waypoints.map(p => ({ x: p.x, y: p.y })));
        } else if (op.type === 'move' || op.type === 'move_elements') {
          const shapes = op.elementIds ? op.elementIds.map(element) : [e], target = op.parentId ? element(op.parentId) : e.parent, delta = { x: op.dx, y: op.dy };
          if (![op.dx,op.dy].every(Number.isFinite) || shapes.some(s => !s.parent || s.waypoints) || !rules.allowed('elements.move', { shapes, delta, target })) fail('Movimiento no admitido.');
          modeling.moveElements(shapes, delta, target);
        } else if (op.type === 'resize') {
          if (![op.x,op.y,op.width,op.height].every(Number.isFinite) || op.width < 20 || op.height < 20 || !rules.allowed('shape.resize', { shape: e })) fail('Tamaño no admitido.');
          modeling.resizeShape(e, { x: op.x, y: op.y, width: op.width, height: op.height },undefined,op.autoResize===false?{autoResize:false}:undefined);
        } else fail('Operación no agrupable: ' + op.type);
      }
      return e;
    }
    function run(operations) {
      const aliases = {}, affectedIds = [];
      const resolve = id => typeof id === 'string' && id.startsWith('@') ? aliases[id.slice(1)] || fail('Alias inexistente: ' + id) : id;
      let sheet;
      operations.forEach((operation, index) => {
        // Name the failing operation, element and alias instead of rejecting the block without detail.
        const target = operation.elementId || operation.elementIds?.[0] || operation.sourceId;
        try {
          if (!supported.includes(operation.type)) fail('Operación no agrupable: ' + operation.type);
          if (operation.as && operation.type === 'matrix') fail('matrix no admite as: devuelve pool, laneN, stageN, las claves de sus figuras y el as de cada conexión.');
          if (operation.as && (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(operation.as) || !['create','connect'].includes(operation.type))) fail('Alias inválido o no admitido en ' + operation.type + ': ' + operation.as + '. Solo create y connect admiten as.');
          if (operation.as && aliases[operation.as]) fail('Alias repetido: ' + operation.as + '. pool, laneN, stageN y las claves de matrix ya están reservados.');
          const op = { ...operation };
          for (const key of ['elementId','parentId','sourceId','targetId','withConnectionId']) if (op[key]) op[key] = resolve(op[key]);
          if (op.elementIds) op.elementIds = op.elementIds.map(resolve);
          if (op.values) op.values = Object.fromEntries(Object.entries(op.values).map(([key, v]) => [key.startsWith('condition:@') ? 'condition:' + resolve(key.slice(10)) : key, ['defaultFlow','referenceId'].includes(key) ? resolve(v) : v]));
          const e = apply(op);
          if(e?.aliases){for(const [key,id]of Object.entries(e.aliases)){if(aliases[key])fail('Alias estructural repetido: '+key+'. Usa otra clave o elimina el as anterior.');aliases[key]=id;}affectedIds.push(...e.affectedIds);if(e.sheet)sheet=e.sheet;}
          else {affectedIds.push(e?.id);if(op.as)aliases[op.as]=e.id;}
        } catch (cause) {
          const elementId = typeof target === 'string' && target.startsWith('@') ? aliases[target.slice(1)] : target;
          const failedOperation = { index, type: operation.type, ...(elementId ? { elementId } : {}), ...(cause.alias || operation.as || target?.startsWith?.('@') ? { alias: cause.alias || operation.as || target.slice(1) } : {}), ...(cause.cell ? { cell: cause.cell } : {}) };
          if (!cause.failedOperation) { cause.failedOperation = failedOperation; cause.message = 'Operación ' + (index + 1) + ' (' + operation.type + (elementId ? ' · ' + elementId : '') + (failedOperation.alias ? ' · ' + failedOperation.alias : '') + '): ' + cause.message; }
          throw cause;
        }
      });
      return { aliases, affectedIds, ...(sheet ? { sheet } : {}) };
    }
    return { apply, run, propertyPlan, supported, types };
  }
  window.NaraMcpOperations = { create, supported, types };
})();
