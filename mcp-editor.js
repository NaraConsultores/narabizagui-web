'use strict';
// Adapter for the existing editor. All changes use native commandStack operations.
(() => {
  // bpmn-js creates an empty DI label for an internal name, including on revert.
  // Restore the original object after its updater so Undo also preserves XML/style.
  const labelEvents=modeler.get('eventBus');
  labelEvents.on('commandStack.element.updateLabel.preExecute',1500,event=>{
    const e=event.context.element;
    if(e.businessObject?.$instanceOf?.('bpmn:Activity')||['bpmn:Participant','bpmn:Lane'].includes(e.type))event.context.naraOriginalDiLabel=e.di?.label;
  });
  labelEvents.on('commandStack.element.updateLabel.reverted',500,event=>{
    const c=event.context;if(Object.hasOwn(c,'naraOriginalDiLabel'))c.element.di?.set('label',c.naraOriginalDiLabel);
  });
  function PositionedLabelHandler(modeling) {
    this.preExecute = context => {
      modeling.updateLabel(context.element, context.text, context.bounds);
      const label = context.element.label;
      if (label) modeling.moveShape(label, { x: context.bounds.x - label.x, y: context.bounds.y - label.y });
    };
    this.execute = () => [];
    this.revert = () => [];
  }
  PositionedLabelHandler.$inject = ['modeling'];
  modeler.get('commandStack').registerHandler('nara.mcp.positionedLabel', PositionedLabelHandler);
  let revision = crypto.randomUUID();
  for (const event of ['commandStack.changed', 'import.done', 'root.set','nara.sheet.changed']) modeler.get('eventBus').on(event, () => { revision = crypto.randomUUID(); });
  const error = (code, message) => Object.assign(new Error(message), { code });
  const lifecycle=window.NaraEditorReadiness.create({snapshot:()=>({ready,loading:loadingDiagram,starting:window.NaraStartupPending,error:window.diagramError,restoring:window.NaraMicrosoftUI?.restoring()||false,saving:saving||Boolean(window.NaraMicrosoftOperation),synchronizing:filePolling,readOnly:browserFiles.readOnly,dialog:window.NaraMicrosoftDialogOpen,form:formPending()})});
  function available(readOnly=false) {
    const current=lifecycle.state();if(!(readOnly?current.canRead:current.canEdit))throw lifecycle.failure(current);
  }
  async function waitReady(expected,target,readOnly=false){const current=await lifecycle.wait(readOnly?'read':'edit',5000);if(!(readOnly?current.canRead:current.canEdit))throw lifecycle.failure(current);if(readOnly){if(target&&target!==browserFiles.documentId)throw error('DOCUMENT_MISMATCH','El archivo cambió. Lee nuevamente.');if(expected!==revision)throw error('REVISION_CONFLICT','El diagrama cambió. Lee nuevamente.');if(formPending())throw error('FORM_PENDING','Termina la edición pendiente antes de exportar.');}else guard(expected,target);return current.waitMs;}
  const runtime=()=>({documentId:browserFiles.documentId,readOnly:Boolean(browserFiles.readOnly),target:fileTarget(),remote:browserFiles.handle?.remoteInfo?.()||null,connection:window.NaraMcpConnectionInfo?.()||null,readiness:lifecycle.state(),autoSave:{enabled:window.naraAutoSave?.enabled??false,running:saving,dirty,blocked:window.naraAutoSave?.blocked?.code||null}});
  let serialized=null;
  function formPending() {
    return window.NaraPropertyDraftPending();
  }
  function guard(expected,target) {
    if(target&&target!==browserFiles.documentId)throw error("DOCUMENT_MISMATCH","El archivo cambió. Lee el documento correcto antes de continuar.");
    available();
    if (blocks?.recovery(false)) throw error('BATCH_RECOVERY_REQUIRED', 'Conserva la copia anterior del bloque y revisa el estado antes de editar.');
    if (window.NaraMicrosoftRecovery) throw error('RECOVERY_REQUIRED', 'Hay una transición de archivo pendiente de recuperación. Conserva su copia antes de editar.');
    if (expected !== revision) throw error('REVISION_CONFLICT', 'El diagrama cambió después de la lectura. Lee la revisión actual y conserva las ediciones manuales.');
    if (formPending()) throw error('FORM_PENDING', 'Hay texto sin aplicar en Propiedades. El usuario debe aplicarlo o descartarlo antes de editar mediante Codex.');
  }
  const element = id => {
    const result = modeler.get('elementRegistry').get(id);
    if (!result || result.labelTarget) throw error('ELEMENT_NOT_FOUND', 'No existe ese elemento editable. Consulta los IDs con read.');
    if (modeler.get('canvas').findRoot(result) !== modeler.get('canvas').getRootElement()) throw error('WRONG_SHEET', 'Abre la hoja del elemento antes de modificarlo.');
    return result;
  };
  function describe(el, target = modeler) {
    const bo = el.businessObject;
    const expression = exp => exp ? { body: exp.body || '', language: exp.language } : undefined;
    let scope = bo.$parent; while (scope && !['bpmn:Process','bpmn:SubProcess','bpmn:Transaction','bpmn:AdHocSubProcess'].includes(scope.$type)) scope = scope.$parent;
    const semantic = window.NaraBpmnProperties?.create(target).describe(el);
    const label = el.label;
    const eventDefinitions = bo.eventDefinitions?.map(d => ({ id: d.id, type: d.$type, name: d.name,
      ...Object.fromEntries(['timeDate','timeDuration','timeCycle','condition'].filter(k => d[k]).map(k => [k, expression(d[k])])),
      ...Object.fromEntries(['messageRef','signalRef','errorRef','escalationRef'].filter(k => d[k]).map(k => [k, { id: d[k].id, name: d[k].name, code: d[k].errorCode || d[k].escalationCode }])) }));
    return { id: el.id, type: el.type, name: el.type === 'bpmn:Group' ? stageName(el) : el.type === 'bpmn:TextAnnotation' ? bo.text || '' : bo.name || '', parentId: el.parent?.id, flowScopeId: scope?.id, attachedToId: bo.attachedToRef?.id, calledElement: bo.calledElement, expanded:el.type==='bpmn:SubProcess'?Boolean(el.di?.isExpanded):undefined, x: el.x, y: el.y, width: el.width, height: el.height, sourceId: el.source?.id, targetId: el.target?.id, waypoints: el.waypoints?.map(p => ({ x: p.x, y: p.y })), labelBounds: label ? { x: label.x, y: label.y, width: label.width, height: label.height } : undefined, documentation: (bo.documentation || []).map(d => d.text || '').join('\n\n'), defaultFlowId: bo.default?.id, condition: expression(bo.conditionExpression), eventDefinitions, semanticProperties: semantic ? Object.fromEntries(semantic.fields.map(f => [f.key, f.value])) : undefined, propertyFields: semantic?.fields, dataState: bo.dataState?.name, visualStyle:window.NaraVisual?.create(target).readStyle(el)||window.NaraStylePanel?.read(el)||{},routing:window.NaraVisual?.create(target).readRouting(el)||undefined,textLayout:window.NaraVisual?.create(target).describeText(el)||undefined, role: target === modeler ? roleFor(el) : undefined, stage: target === modeler ? phaseFor(el) : undefined };
  }
  async function read({ includeXml = false, includePropertyFields = false, elementIds, detail='full',waitForReadyMs=0 } = {}) {
    const readiness=await lifecycle.wait(detail==='summary'&&waitForReadyMs>0?'prepare':'read',waitForReadyMs);
    if(!readiness.canRead){if(detail==='summary')return{editorVersion:window.NaraAppVersion||'unknown',editorBuild:window.NaraAppBuild||'unknown',revision,fileName:browserFiles.name,documentReady:false,elementsOmitted:true,...runtime(),readiness};throw lifecycle.failure(readiness);}
    const base = revision;
    if(!serialized||serialized.revision!==base){const {xml}=await modeler.saveXML({format:true});const sha256=await browserFiles.digest(xml);if(base===revision)serialized={revision:base,xml,sha256};else throw error('REVISION_CONFLICT','El diagrama cambió durante la lectura. Lee nuevamente.');}
    const {xml,sha256}=serialized;
    if (base !== revision) throw error('REVISION_CONFLICT', 'El diagrama cambió durante la lectura. Lee nuevamente.');
    const present=state=>{Object.assign(state,runtime(),{documentReady:true});Object.assign(state.capabilities,{protocolVersion:window.NaraModelAudit?.PROTOCOL_VERSION||5,toolContract:window.NaraModelAudit?.TOOL_CONTRACT||'visual-quality-v1',microsoftFiles:window.NaraMicrosoftFiles?.capabilities||null,matrix:state.diagramType==='bpmn'&&Boolean(window.NaraMcpStructure),clearActive:state.diagramType==='bpmn'&&Boolean(window.NaraMcpStructure),matrixActivitySize:state.diagramType==='bpmn'&&Boolean(window.NaraMcpStructure),matrixLinkLabels:state.diagramType==='bpmn'&&Boolean(window.NaraMcpStructure),clearPreservesSheet:state.diagramType==='bpmn'&&Boolean(window.NaraMcpStructure),operationErrorDetail:true,editSummary:true,fit:true,documentGuard:true,tabIsolation:true,compactRead:true,compactBatch:true,batchPresentation:true,visualFormatting:state.diagramType==='bpmn',activityResize:state.diagramType==='bpmn',fitText:state.diagramType==='bpmn',orthogonalRouting:state.diagramType==='bpmn',persistentAnchors:state.diagramType==='bpmn',adaptiveRouting:state.diagramType==='bpmn',laneBorderRouting:state.diagramType==='bpmn'&&Boolean(window.NaraModelAudit?.laneRouteConflicts),laneBorderClearance:state.diagramType==='bpmn'?window.NaraModelAudit?.LANE_BORDER_CLEARANCE??null:null,localRouteRecalculation:state.diagramType==='bpmn',visualQuality:true,waitForReadyMs:5000,waitForAutoSaveMs:5000});if(detail==='summary')return window.NaraEditorReadiness.compact(state);return state;};
    const canvas = modeler.get('canvas'), er=window.NaraER,activeSheetId = er?.active() || canvas.getRootElement().id;
    if(er?.active()){
      const dataModel=er.read(),elements=[...dataModel.tables.map(t=>({...t,type:'nara:Entity',height:window.NaraERModel.height(t)})),...dataModel.relationships.map(r=>({...r,type:'nara:Relationship'}))];
      const selectedElements=elementIds?elements.filter(e=>elementIds.includes(e.id)):elements;
      return present({editorVersion:window.NaraAppVersion||'unknown',editorBuild:window.NaraAppBuild||'unknown',capabilities:{protocolVersion:5,semanticProperties:false,structuredValidation:Boolean(window.NaraModelAudit),batch:false,batchLimit:0,batchOperations:[]},revision,sha256,fileName:browserFiles.name,diagramType:'erd',activeSheetId,sheets:modeler.get('naraSheets').list(),dirty,unappliedProperties:formPending(),canSaveToFile:Boolean(browserFiles.handle),selectedIds:er.selected()?[er.selected()]:[],selectedFieldId:er.selectedField(),warnings:(window.importWarnings||[]).map(w=>w.message||String(w)),canUndo:modeler.get('commandStack').canUndo(),canRedo:modeler.get('commandStack').canRedo(),totalElements:elements.length,elementsFiltered:Boolean(elementIds),elementsTruncated:selectedElements.length>2000,elements:selectedElements.slice(0,2000),dataModel,expandedCanvas:window.NaraExpandedCanvas?.()||false,...(includeXml?{xml}:{})});
    }
    const elements = modeler.get('elementRegistry').getAll().filter(e => e.businessObject && !e.labelTarget && canvas.findRoot(e)?.id === activeSheetId);
    const selectedElements = elementIds ? elements.filter(e => elementIds.includes(e.id)) : elements;
    return present({ editorVersion:window.NaraAppVersion||'unknown', editorBuild:window.NaraAppBuild||'unknown', capabilities:{protocolVersion:5,visualFormatting:true,documentFormatting:true,activityResize:true,fitText:true,orthogonalRouting:true,sharedConnectionRouting:true,persistentAnchors:true,compactContainer:true,visualQuality:true,semanticProperties:Boolean(window.NaraMcpOperations),structuredValidation:Boolean(window.NaraModelAudit),batch: Boolean(blocks),batchLimit:200,batchOperations:window.NaraMcpOperations?.supported||[]}, recentBatches:blocks?.recent()||[], batchRecovery:blocks?.recovery(includeXml), revision, sha256, fileName: browserFiles.name, diagramType:'bpmn', activeSheetId, sheets: modeler.get('naraSheets').list(), dirty, unappliedProperties: formPending(), canSaveToFile: Boolean(browserFiles.handle), selectedIds: modeler.get('selection').get().map(e => e.id), warnings: (window.importWarnings || []).map(w => w.message || String(w)), canUndo: modeler.get('commandStack').canUndo(), canRedo: modeler.get('commandStack').canRedo(), totalElements: elements.length, elementsFiltered:Boolean(elementIds), elementsTruncated: selectedElements.length > 2000, elements:detail==='summary'?[]:selectedElements.slice(0, 2000).map(e=>{const result=describe(e);if(!includePropertyFields)delete result.propertyFields;return result;}),expandedCanvas:window.NaraExpandedCanvas?.()||false, ...(includeXml ? { xml } : {}) });
  }
  async function edit({ expectedRevision, expectedDocumentId, operation: op, response='full' }) {
    await waitReady(expectedRevision,expectedDocumentId);
    if(!['full','summary'].includes(response))throw error('INVALID_OPERATION','response admite full o summary.');
    // summary keeps revision, active sheet and sheet list without elements or XML.
    const after=()=>read(response==='summary'?{detail:'summary'}:{});
    if(['matrix','clear','lane_add','lane_split'].includes(op.type))return blocks.batch({expectedRevision,requestId:op.requestId||crypto.randomUUID(),operations:[op],fit:true,response});
    if (blocks && window.NaraMcpOperations.supported.includes(op.type) && !window.NaraER?.active()) {
      const affected = blocks.apply(op); keepDocumentDraft = null;
      if (affected?.parent) modeler.get('selection').select(affected);
      status('Cambio de Codex aplicado · Guarda el archivo para conservarlo.');
      return { applied:true, affectedId:affected?.id, ...(await after()) };
    }
    if (op.type === 'open_bpmn') {
      const occupied = modeler.get('elementRegistry').getAll().some(e => e.businessObject && !e.labelTarget && e.parent && (e.type !== 'bpmn:StartEvent' || e.businessObject.name));
      if (dirty || browserFiles.handle || occupied || window.NaraER?.list().length) throw error('DOCUMENT_NOT_EMPTY', 'Abrir mediante MCP requiere una pestaña nueva vacía, sin cambios ni archivo vinculado. Conserva el documento actual.');
      await acceptBrowserSource({ name: op.fileName, xml: op.xml, handle: null });
      return { applied: true, ...(await after()) };
    }
    if(op.type==='view'){window.NaraSetFocus(op.expanded);return{applied:true,...(await after())};}
    if(op.type==='fit'){fit();return{applied:true,viewOnly:true,...(await read({detail:'summary'}))};}
    if(op.type==='style'){const affectedId=window.NaraStylePanel.apply(op.elementId,op.style);return{applied:true,affectedId,...(await after())};}
    if(op.type.startsWith('erd_')){const affectedId=window.NaraER.edit(op);return{applied:true,affectedId,...(await after())};}
    if(window.NaraER?.active()&&['label','move','resize','delete'].includes(op.type)){
      let erOp;
      if(op.type==='delete')erOp={type:'erd_delete',elementId:op.elementId};
      else{const entity=window.NaraERModel.table(window.NaraER.read(),op.elementId);erOp={type:'erd_table_update',tableId:entity.id,...(op.type==='label'?{name:op.text}:op.type==='move'?{x:entity.x+op.dx,y:entity.y+op.dy}:{x:op.x,y:op.y,width:op.width})};}
      const affectedId=window.NaraER.edit(erOp);return{applied:true,affectedId,...(await after())};
    }
    if(window.NaraER?.active()&&['create','connect','stage','stage_split','lane_add','lane_split','documentation','sheet_link','subprocess_open','route','move_elements'].includes(op.type))throw error('WRONG_DIAGRAM_TYPE','Esta operación requiere una hoja BPMN. Para tablas y relaciones usa las operaciones erd_.');
    const modeling = modeler.get('modeling'), factory = modeler.get('elementFactory'), canvas = modeler.get('canvas'), rules = modeler.get('rules');
    let affected;
    if (op.type === 'label') {
      affected = element(op.elementId);
      if (op.bounds && !['bpmn:StartEvent','bpmn:EndEvent','bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent','bpmn:ExclusiveGateway','bpmn:ParallelGateway','bpmn:SequenceFlow','bpmn:MessageFlow','bpmn:Association','bpmn:Group','bpmn:DataObjectReference','bpmn:DataStoreReference'].includes(affected.type)) throw error('INVALID_OPERATION', 'La posición corresponde a una etiqueta externa.');
      if (affected.type === 'bpmn:TextAnnotation') modeling.updateProperties(affected, { text: op.text });
      else if (op.bounds) modeler.get('commandStack').execute('nara.mcp.positionedLabel', { element: affected, text: op.text, bounds: op.bounds });
      else modeling.updateLabel(affected, op.text);
    } else if (op.type === 'documentation') {
      affected = element(op.elementId);
      modeling.updateProperties(affected, { documentation: op.text ? [modeler.get('moddle').create('bpmn:Documentation', { text: op.text })] : [] });
    } else if (op.type === 'create') {
      const types = ['bpmn:Task','bpmn:ManualTask','bpmn:UserTask','bpmn:ServiceTask','bpmn:SubProcess','bpmn:CallActivity','bpmn:StartEvent','bpmn:EndEvent','bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent','bpmn:ExclusiveGateway','bpmn:ParallelGateway','bpmn:TextAnnotation','bpmn:DataObjectReference','bpmn:DataStoreReference','bpmn:Participant'];
      if (!types.includes(op.bpmnType) || !Number.isFinite(op.x) || !Number.isFinite(op.y)) throw error('INVALID_OPERATION', 'Tipo o posición inválidos.');
      const props = op.bpmnType === 'bpmn:TextAnnotation' ? { text: op.name || '' } : { name: op.name || '' };
      const businessObject = modeler.get('bpmnFactory').create(op.bpmnType, props);
      if (op.linkName !== undefined) {
        if (!['bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent'].includes(op.bpmnType) || !op.linkName.trim()) throw error('INVALID_OPERATION', 'Un enlace requiere un evento intermedio y nombre.');
        const definition = modeler.get('bpmnFactory').create('bpmn:LinkEventDefinition', { name: op.linkName });
        definition.$parent = businessObject;
        businessObject.eventDefinitions = [definition];
      }
      const shape = op.bpmnType === 'bpmn:Participant'
        ? factory.createParticipantShape({ businessObject, isExpanded: true })
        : factory.createShape({ type: op.bpmnType, businessObject });
      const parent = op.parentId ? element(op.parentId) : canvas.getRootElement();
      if (!rules.allowed('shape.create', { shape, target: parent, position: { x: op.x, y: op.y } })) throw error('BPMN_RULE', 'No se permite crear ese elemento en el contenedor elegido.');
      affected = modeling.createShape(shape, { x: op.x, y: op.y }, parent);
    } else if (op.type === 'connect') {
      const source = element(op.sourceId), target = element(op.targetId);
      const connection = op.bpmnType ? { type: op.bpmnType } : undefined;
      const allowed = rules.allowed('connection.create', { source, target, connection });
      if (!allowed || (connection && allowed.type && allowed.type !== connection.type)) throw error('BPMN_RULE', 'La conexión solicitada no es válida entre esos elementos.');
      affected = modeling.connect(source, target, connection);
    } else if (op.type === 'move_elements') {
      const shapes = op.elementIds.map(element), target = element(op.parentId), delta = { x: op.dx, y: op.dy };
      if (shapes.some(s => !s.parent || s.waypoints || ['bpmn:Participant','bpmn:Lane'].includes(s.type)) || !rules.allowed('elements.move', { shapes, delta, target })) throw error('BPMN_RULE', 'No se permite mover ese conjunto de figuras al contenedor.');
      modeling.moveElements(shapes, delta, target);
      affected = shapes[0];
    } else if (op.type === 'move') {
      affected = element(op.elementId);
      if (!affected.parent || affected.waypoints || !Number.isFinite(op.dx) || !Number.isFinite(op.dy)) throw error('INVALID_OPERATION', 'Elige una figura y un desplazamiento válido.');
      const target = op.parentId ? element(op.parentId) : affected.parent;
      const delta = { x: op.dx, y: op.dy };
      if (!rules.allowed('elements.move', { shapes: [affected], delta, target })) throw error('BPMN_RULE', 'El movimiento no está permitido.');
      modeling.moveElements([affected], delta, target);
    } else if (op.type === 'resize') {
      affected = element(op.elementId);
      if (![op.x, op.y, op.width, op.height].every(Number.isFinite) || op.width < 20 || op.height < 20 || !rules.allowed('shape.resize', { shape: affected })) throw error('BPMN_RULE', 'No se permite ese tamaño para el elemento.');
      modeling.resizeShape(affected, { x: op.x, y: op.y, width: op.width, height: op.height });
    } else if (op.type === 'route') {
      affected = element(op.elementId);
      if (!affected.waypoints || !Array.isArray(op.waypoints) || op.waypoints.length < 2 || op.waypoints.length > 100 || op.waypoints.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw error('INVALID_OPERATION', 'El trazado requiere una conexión y entre 2 y 100 puntos válidos.');
      window.NaraVisual.create(modeler).manualRoute(affected,op.waypoints.map(p => ({ x: p.x, y: p.y })));
    } else if (op.type === 'delete') {
      affected = element(op.elementId);
      if (!affected.parent) throw error('BPMN_RULE', 'No se puede eliminar la raíz.');
      modeling.removeElements([affected]);
    } else if(op.type==='stage_split'){
      const context={sourceId:element(op.elementId).id,count:op.count};modeler.get('commandStack').execute('project.stage.split',context);affected=context.stages[0];
    } else if (op.type === 'stage') {
      if(op.sourceId)element(op.sourceId);
      const context = op.sourceId?{sourceId:op.sourceId,direction:op.direction||'right'}:{};
      modeler.get('commandStack').execute('project.stage.add', context);
      affected = context.stage;
    } else if (op.type === 'lane_add' || op.type === 'lane_split') {
      const target = element(op.elementId);
      if (!['bpmn:Participant', 'bpmn:Lane'].includes(target.type) || target.di?.isExpanded === false) throw error('BPMN_RULE', 'Selecciona un participante expandido o un carril.');
      if (op.type === 'lane_add') affected = modeling.addLane(target, op.location);
      else {
        const length = target.di?.isHorizontal === false ? target.width : target.height;
        if (!Number.isInteger(op.count) || op.count < 2 || op.count > 10 || length < op.count * 60) throw error('BPMN_RULE', 'El contenedor requiere al menos 60 unidades por carril (2 a 10 carriles).');
        modeling.splitLane(target, op.count);
        affected = target;
      }
    } else if (op.type === 'sheet_create') {
      affected = modeler.get('naraSheets').create(op.name);
    } else if (op.type === 'sheet_open') {
      modeler.get('naraSheets').open(op.sheetId);
    } else if (op.type === 'sheet_rename') {
      modeler.get('naraSheets').rename(op.sheetId, op.name);
    } else if (op.type === 'subprocess_open') {
      modeler.get('naraSheets').openSubprocess(op.elementId);
    } else if (op.type === 'sheet_link') {
      element(op.elementId);
      affected = modeler.get('naraSheets').link(op.elementId, op.sheetId);
    } else if (op.type === 'undo' || op.type === 'redo') {
      const stack = modeler.get('commandStack');
      if (!(op.type === 'undo' ? stack.canUndo() : stack.canRedo())) throw error('NO_HISTORY', 'No hay una operación que deshacer o rehacer.');
      stack[op.type]();
    } else throw error('INVALID_OPERATION', 'Operación no admitida.');
    keepDocumentDraft = null;
    if (affected?.parent && op.type !== 'delete') modeler.get('selection').select(affected);
    status(['sheet_open','subprocess_open'].includes(op.type) ? 'Hoja abierta por Codex.' : 'Cambio de Codex aplicado.');
    return { applied: true, affectedId: affected?.id, ...(await after()) };
  }
  async function save({ expectedRevision, expectedDocumentId }) {
    await waitReady(expectedRevision,expectedDocumentId);
    const handle = browserFiles.handle;
    if (!handle || !(standalone || detached)) throw error('FILE_SELECTION_REQUIRED', 'Pulsa Guardar como en el visor y elige el destino antes de guardar mediante Codex.');
    if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw error('FILE_PERMISSION_REQUIRED', 'Pulsa Guardar en el visor para autorizar la escritura del archivo.');
    guard(expectedRevision);
    saving = true;
    const sequence = editSequence;
    try {
      const { xml } = await modeler.saveXML({ format: true });
      if (revision !== expectedRevision) throw error('REVISION_CONFLICT', 'El diagrama cambió antes del guardado. Lee de nuevo.');
      await browserFiles.save(xml, handle);
      const persisted = await browserFiles.read();
      const sha256 = await browserFiles.digest(xml);
      if (persisted.hash !== sha256) throw error('SAVE_NOT_VERIFIED', 'El archivo escrito no coincide con la revisión enviada. Lee y comprueba antes de volver a guardar.');
      if (sequence === editSequence) setDirty(false);
      browserFileContext(browserFiles.name);
      byId('externalChange').hidden = true;
      status(handle.storageKind === 'microsoft' ? 'Archivo guardado por Codex en Microsoft · Escritura comprobada.' : 'Archivo guardado por Codex · Escritura comprobada e historial conservado.');
      window.naraAutoSave?.reset();
      return { documentId:browserFiles.documentId,saved: true, storage: handle.storageKind === 'microsoft' ? 'microsoft' : 'local', savedRevision: expectedRevision, revision, sha256, fileName: browserFiles.name, dirty,remote:handle.remoteInfo?.()||null };
    } catch (cause) {
      if(cause.code==='EXTERNAL_CHANGE'){
        saving=false;filePolling=true;
        try{if(await combineBrowserSource(await browserFiles.read()))throw error('REVISION_CONFLICT','Se combinaron cambios compartidos. Lee la nueva revisión antes de confirmar otro guardado mediante Codex.');}
        finally{filePolling=false;}
      }
      else window.naraAutoSave?.block(cause);
      throw cause;
    } finally { saving = false; window.naraAutoSave?.refresh(); }
  }
  async function exportPng({ expectedRevision, expectedDocumentId, scale = 2 }) {
    await waitReady(expectedRevision,expectedDocumentId,true);
    if (!Number.isFinite(scale) || scale < 0.5 || scale > 3) throw error('INVALID_SCALE', 'La escala debe estar entre 0.5 y 3.');
    decorateStages(); decorateDocuments();
    await document.fonts.ready;
    const svg = window.NaraER?.active()?window.NaraER.exportSvg():(await modeler.saveSVG()).svg;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw error('PNG_EXPORT_ERROR', 'El diagrama no tiene dimensiones exportables.');
      const effectiveScale = Math.min(scale, 8192 / image.naturalWidth, 8192 / image.naturalHeight, Math.sqrt(16000000 / (image.naturalWidth * image.naturalHeight)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(image.naturalWidth * effectiveScale));
      canvas.height = Math.max(1, Math.floor(image.naturalHeight * effectiveScale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      if (revision !== expectedRevision) throw error('REVISION_CONFLICT', 'El diagrama cambió durante la exportación. Lee y exporta nuevamente.');
      if (dataUrl.length > 8 * 1024 * 1024 * 4 / 3 + 40) throw error('PNG_TOO_LARGE', 'El PNG supera 8 MB. Exporta con una escala menor.');
      const sheetId = window.NaraER?.active()||modeler.get('canvas').getRootElement().id;
      return { pngBase64: dataUrl.slice(dataUrl.indexOf(',') + 1), width: canvas.width, height: canvas.height, revision, fileName: browserFiles.name, sheetId, sheetName: modeler.get('naraSheets').list().find(s => s.id === sheetId)?.name, effectiveScale };
    } finally { URL.revokeObjectURL(url); }
  }
  async function presentBatch({expandedCanvas,fit:shouldFit}){
    if(expandedCanvas!==undefined)window.NaraSetFocus(expandedCanvas);
    if(shouldFit)fit();
    if(document.visibilityState!=='visible')return{paintConfirmed:false,reason:'background'};
    if(document.querySelector('dialog[open]'))return{paintConfirmed:false,reason:'dialog_open'};
    return new Promise(resolve=>{let finished=false;const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value);},timer=setTimeout(()=>finish({paintConfirmed:false,reason:'frame_timeout'}),250);requestAnimationFrame(()=>requestAnimationFrame(()=>finish(document.visibilityState==='visible'&&!document.querySelector('dialog[open]')?{paintConfirmed:true}:{paintConfirmed:false,reason:'visibility_changed'})));});
  }
  const blocks = window.NaraMcpBlocks?.create({ modeler, read, guard, waitReady,describe,fit:()=>fit(),present:presentBatch,getRevision:()=>revision });
  async function validate({ expectedRevision, profile = 'review', geometry = true, maxIssues = 200,elementIds }) {
    const readiness=await lifecycle.wait('read',5000);if(!readiness.canRead)throw lifecycle.failure(readiness); if (expectedRevision !== revision) throw error('REVISION_CONFLICT', 'Lee la revisión actual antes de validar.');
    const state = await read(); if (expectedRevision !== revision) throw error('REVISION_CONFLICT', 'El diagrama cambió durante la validación.');
    return { revision, sha256:state.sha256, activeSheetId:state.activeSheetId, ...window.NaraModelAudit.validateSnapshot(state, { profile, geometry, maxIssues }),quality:geometry?window.NaraModelAudit.reviewVisualQuality(state,{elementIds,maxIssues}):undefined };
  }
  const localHandles=new WeakMap();
  function fileTarget(){
    const handle=browserFiles.handle;if(!handle)return null;
    if(handle.storageKind==='microsoft')return{storage:'microsoft',driveId:handle.driveId,itemId:handle.itemId};
    if(!localHandles.has(handle))localHandles.set(handle,crypto.randomUUID());
    return{storage:'local',localRef:localHandles.get(handle),name:browserFiles.name};
  }
  const fileAdapter={
    state:()=>({revision,documentId:browserFiles.documentId,target:fileTarget(),handle:browserFiles.handle,dirty,recoveryRequired:Boolean(window.NaraMicrosoftRecovery),unappliedProperties:formPending()||Boolean(typeof browserEditPending==='function'&&browserEditPending()),uncertain:Boolean(browserFiles.handle&&(browserFiles.uncertain===browserFiles.handle||browserFiles.handle.uncertain))||['SAVE_UNCERTAIN','SAVE_NOT_VERIFIED','RESULT_UNKNOWN'].includes(window.naraAutoSave?.blocked?.code),readiness:lifecycle.state(),...runtime()}),
    prepare:async expected=>{await waitReady(expected);if(!(standalone||detached))throw error('FILE_MODE_UNSUPPORTED','Abre una pestaña de archivo independiente para usar Microsoft.');},
    snapshot:async()=>({xml:(await modeler.saveXML({format:true})).xml}),
    lock:()=>{const previous=document.body.inert;window.NaraMicrosoftOperation=true;document.body.inert=true;window.naraAutoSave?.cancel();return()=>{window.NaraMicrosoftOperation=false;document.body.inert=previous;window.naraAutoSave?.refresh();};},
    enableAutoSave:value=>{byId('autoSaveEnabled').checked=value;window.naraAutoSave.enable(value);},
    attach:async(source,check,enabled)=>{
      const hash=await browserFiles.digest(source.xml);check();
      await browserFiles.attach({...source,hash});
      browserDocumentVersion++;revision=crypto.randomUUID();serialized=null;setDirty(false);browserFileContext(source.name);
      fileAdapter.enableAutoSave(enabled);status('Archivo Microsoft asociado · Bytes y destino comprobados.');
    },
    validateSource:async xml=>{
      browserFiles.validate(xml);
      const host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px;width:1200px;height:800px;visibility:hidden';document.body.appendChild(host);
      const draft=new BpmnJS({container:host,moddleExtensions:{nara:window.NaraERModdle}});
      try{
        const imported=await draft.importXML(xml);if(imported.warnings.length)throw error('INVALID_BPMN','La importación temporal contiene advertencias. Conserva el documento actual.');
        const definitions=draft.getDefinitions();
        for(const extension of definitions.extensionElements?.values||[])if(extension.$type==='nara:EntityRelationship')window.NaraERModel.validate(JSON.parse(extension.json));
        for(const diagram of definitions.diagrams||[]){const opened=await draft.open(diagram);if(opened.warnings?.length)throw error('INVALID_BPMN','Una hoja adicional contiene advertencias de importación.');}
      }
      finally{draft.destroy();host.remove();}
    },
    open:async(source,check,enabled)=>{
      const previousXml=(await modeler.saveXML({format:true})).xml,previous={handle:browserFiles.handle,name:browserFiles.name,hash:browserFiles.hash,version:browserFiles.version,baseXml:browserFiles.baseXml,uncertain:browserFiles.uncertain},previousDocumentId=browserFiles.documentId,previousDirty=dirty,documentVersion=browserDocumentVersion;
      const view=modeler.get('canvas').viewbox(),erView=window.NaraER?.active()?window.NaraER.view():null,sheetId=window.NaraER?.active()||modeler.get('canvas').getRootElement()?.id;
      check();loadingDiagram=true;
      try{
        await openDiagram(source.xml);check.identity();
        if(browserFiles.handle!==previous.handle||browserDocumentVersion!==documentVersion)throw error('FILE_CHANGED','Cambió el documento durante la importación.');
        const hash=await browserFiles.digest(source.xml);check.identity();
        if(browserFiles.handle!==previous.handle||browserDocumentVersion!==documentVersion)throw error('FILE_CHANGED','Cambió el destino antes de asociarlo.');
        await browserFiles.attach({...source,hash});browserDocumentVersion++;revision=crypto.randomUUID();serialized=null;
        browserFileContext(source.name);setDirty(false);fileAdapter.enableAutoSave(enabled);
      }catch(cause){
        try{
          await openDiagram(previousXml);
          if((await modeler.saveXML({format:true})).xml!==previousXml)throw error('RECOVERY_REQUIRED','La restauración no coincide con la instantánea.');
          let sameIdentity=true;try{check.identity();}catch{sameIdentity=false;}
          if(sameIdentity&&(browserFiles.handle!==previous.handle||browserFiles.documentId!==previousDocumentId)){
            if(previous.handle)await browserFiles.attach({...previous,xml:previousXml});
            else browserFiles.detach();
          }else if(!sameIdentity)browserFiles.detach();
          Object.assign(browserFiles,previous);if(sameIdentity&&!previous.handle)browserFiles.documentId=previousDocumentId;
          if(!sameIdentity){browserFiles.handle=null;browserFiles.hash=null;}
          browserDocumentVersion++;revision=crypto.randomUUID();serialized=null;setDirty(sameIdentity?previousDirty:true);browserFileContext(previous.name);
          if(modeler.get('naraSheets').list().some(s=>s.id===sheetId))modeler.get('naraSheets').open(sheetId);
          if(erView)window.NaraER.restoreView(erView);else modeler.get('canvas').viewbox(view);
        }catch(restoreError){window.NaraMicrosoftRecovery={xml:previousXml,context:previous,message:restoreError.message};throw error('RECOVERY_REQUIRED','La apertura falló y la recuperación requiere revisión. La instantánea sigue en memoria.');}
        throw cause;
      }finally{loadingDiagram=false;}
    },
    saveCurrent:async(expected,check=()=>{})=>{
      const handle=browserFiles.handle;if(!handle)throw error('FILE_SELECTION_REQUIRED','Conserva el documento en un destino explícito antes de abrir otro.');
      if(handle.queryPermission&&await handle.queryPermission({mode:'readwrite'})!=='granted')throw error('FILE_PERMISSION_REQUIRED','El destino actual necesita autorización en el editor.');
      const xml=(await modeler.saveXML({format:true})).xml;check();if(revision!==expected)throw error('REVISION_CONFLICT','El documento cambió antes de guardar.');
      saving=true;
      try{await browserFiles.save(xml,handle,{canCommit:()=>{try{check();return revision===expected&&browserFiles.handle===handle;}catch{return false;}}});if(revision===expected)setDirty(false);}
      finally{saving=false;}
    }
  };
  const microsoftActions=Object.fromEntries(['Status','Resolve','List','Create','Open','Attach','Autosave'].map(suffix=>['microsoft'+suffix,args=>{if(!window.NaraMicrosoftFiles)throw error('EDITOR_NOT_READY','Microsoft aún se está preparando.');return window.NaraMicrosoftFiles[suffix.toLowerCase()](args);} ]));
  window.NaraBizaguiEditor = window.NaraFlowsEditor = Object.freeze({ read, edit, save, exportPng, validate, fileAdapter, ...microsoftActions,editBatch: args => { if(args.expectedDocumentId&&args.expectedDocumentId!==browserFiles.documentId)throw error("DOCUMENT_MISMATCH","El archivo cambió. Lee nuevamente.");return blocks.batch(args); } });
})();
