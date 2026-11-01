'use strict';
(() => {
  const fail = (code, message) => Object.assign(Error(message), { code });
  function create({ modeler, read, guard, waitReady=async()=>{},fit=()=>{},present,describe, getRevision }) {
    const runner = window.NaraMcpOperations.create(modeler), stack = modeler.get('commandStack'), requests = new Map();
    let recovery = null;
    function Block() { this.preExecute = c => { c.result = runner.run(c.operations); }; this.execute = this.revert = () => []; }
    stack.registerHandler('nara.mcp.block', Block);
    const recent = () => [...requests].map(([requestId, r]) => ({ requestId, status: r.status, beforeRevision: r.beforeRevision, committedRevision: r.result?.committedRevision, operationCount: r.count })).slice(-64);
    const remember = (id, entry) => { requests.set(id, entry); if (requests.size > 64) requests.delete(requests.keys().next().value); };
    async function preview(xml, operations) {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:800px;visibility:hidden'; document.body.appendChild(host);
      const draft = new BpmnJS({ container: host,additionalModules:window.NaraVisualModule?[window.NaraVisualModule]:[],moddleExtensions: window.NaraERModdle ? { nara: window.NaraERModdle } : {} });
      try {
        const active = modeler.get('canvas').getRootElement().businessObject.id;
        const { warnings } = await draft.importXML(xml);
        const diagram = (draft.getDefinitions().diagrams || []).find(d => d.plane.bpmnElement.id === active);
        if (draft.get('canvas').getRootElement().businessObject.id !== active) {
          if (!diagram) throw fail('BATCH_SCOPE_UNAVAILABLE', 'No se puede prevalidar la hoja activa sin cambiar su ámbito.');
          await draft.open(diagram);
        }
        if (warnings.length) throw fail('BATCH_IMPORT_WARNING', 'La copia temporal tiene advertencias de importación; revisa antes de agrupar.');
        const draftRunner = window.NaraMcpOperations.create(draft);
        const before = { elements: draft.get('elementRegistry').getAll().filter(e => e.businessObject && !e.labelTarget && draft.get('canvas').findRoot(e) === draft.get('canvas').getRootElement()).map(e => describe(e, draft)) };
        const result = draftRunner.run(operations);
        const after = { diagramType: 'bpmn', elements: draft.get('elementRegistry').getAll().filter(e => e.businessObject && !e.labelTarget && draft.get('canvas').findRoot(e) === draft.get('canvas').getRootElement()).map(e => describe(e, draft)) };
        return { ...result,previewElements:after.elements,diff: window.NaraModelAudit.compareSnapshots(before, after), validation: window.NaraModelAudit.validateSnapshot(after) };
      } finally { draft.destroy(); host.remove(); }
    }
    const format=(result,response)=>{if(response==='full')return result;const output={...result};if(result.state)output.state=window.NaraEditorReadiness.compact(result.state);if(result.previewElements){delete output.previewElements;output.previewElementsOmitted=true;}return output;};
    async function batch({ expectedRevision, expectedDocumentId, requestId, operations, dryRun = false,fit:shouldFit=false,requireValid=false,presentation={},response='full' }) {
      const started=Date.now();
      if(!['full','summary'].includes(response)||!presentation||Array.isArray(presentation)||typeof presentation!=='object'||presentation.expandedCanvas!==undefined&&typeof presentation.expandedCanvas!=='boolean')throw fail('INVALID_BATCH','Opciones de respuesta o presentación inválidas.');
      const timings={};
      if (typeof requestId !== 'string' || !requestId.length || requestId.length > 100) throw fail('INVALID_BATCH', 'El bloque requiere un identificador de solicitud.');
      if (recovery) throw fail('BATCH_RECOVERY_REQUIRED', 'Conserva la copia anterior y revisa el estado antes de continuar.');
      const limit=window.NaraModelAudit.BATCH_LIMIT;
      if (!Array.isArray(operations) || !operations.length || operations.length > limit || operations.some(op => !runner.supported.includes(op.type))||operations.reduce((sum,op)=>sum+(op.type==='matrix'?1+(op.lanes?.length||0)+(op.stages?.length||0)+(op.activities?.length||0)+(op.links?.length||0):1),0)>500) throw fail('INVALID_BATCH', 'El bloque admite hasta '+limit+' operaciones BPMN y un coste estructural máximo de 500 elementos/acciones.');
      const fingerprint = JSON.stringify({ expectedRevision, operations,fit:shouldFit,requireValid,presentation }), previous = requests.get(requestId);
      if (!dryRun && previous) {
        if (previous.fingerprint !== fingerprint) throw fail('REQUEST_ID_REUSED', 'El identificador ya pertenece a otro bloque o revisión.');
        return format({ ...(previous.result || { applied:false, requestId, reconciliationRequired:true, status:previous.status }), replayed: true, state: await read() },response);
      }
      const waitMs=await waitReady(expectedRevision,expectedDocumentId);guard(expectedRevision,expectedDocumentId);timings.readinessMs=Date.now()-started;let phase=Date.now();const before = await read({ includeXml: true }); guard(expectedRevision,expectedDocumentId);timings.readMs=Date.now()-phase;
      if (before.diagramType !== 'bpmn' || before.elementsTruncated) throw fail('BATCH_SCOPE_UNAVAILABLE', 'Agrupar requiere una hoja BPMN con lectura completa.');
      phase=Date.now();const planned = await preview(before.xml, operations);timings.prevalidationMs=Date.now()-phase;await waitReady(expectedRevision,expectedDocumentId); guard(expectedRevision,expectedDocumentId);
      if (dryRun||requireValid&&!planned.validation.valid) return format({ applied: false, dryRun, ...(requireValid&&!planned.validation.valid?{code:'BATCH_VALIDATION_FAILED',message:'La prevalidación encontró errores; el lienzo no fue modificado.'}:{}),sourceRevision: expectedRevision, operationCount: operations.length, previewAliases: planned.aliases,previewElements:planned.previewElements,diff: planned.diff, validation: planned.validation,timings:{...timings,totalMs:Date.now()-started} },response);
      const record = { fingerprint, beforeRevision: expectedRevision, count: operations.length, status: 'applying' }; remember(requestId, record);
      // bpmn-js 18.16: retain history/redo and unwind a failed native command.
      // This path is regression-tested against the pinned CommandStack runtime.
      const history = { actions: stack._stack.slice(), index: stack._stackIdx, execution: { ...stack._currentExecution, actions: [...stack._currentExecution.actions], dirty: [...stack._currentExecution.dirty] } };
      const context = { operations };
      let failure;
      phase=Date.now();try { stack.execute('nara.mcp.block', context); } catch (cause) { failure = cause; }timings.applyMs=Date.now()-phase;
      if (!failure) {
        const committedRevision=getRevision();let viewWarning;phase=Date.now();
        let rendered={paintConfirmed:false,reason:'not_requested'};
        try{if(present)rendered=await present({...presentation,fit:shouldFit});else if(shouldFit)fit();}catch(cause){viewWarning=cause.message;rendered={paintConfirmed:false,reason:'presentation_failed'};}
        timings.presentationMs=Date.now()-phase;if(rendered?.paintConfirmed)timings.firstVisibleMs=Date.now()-started;
        record.status = 'applied'; record.result = { applied: true, requestId, committedRevision, operationCount: operations.length,waitMs:waitMs||0,...(viewWarning?{viewWarning}:{}),presentation:rendered, ...context.result };
        // A concurrent manual edit during serialization must never be undone.
        phase=Date.now();try { const after = await read(); record.result.state = after; record.result.validation = window.NaraModelAudit.validateSnapshot(after);if(window.NaraModelAudit.reviewVisualQuality)record.result.validation.quality=window.NaraModelAudit.reviewVisualQuality(after,{elementIds:context.result.affectedIds});if(after.revision!==committedRevision)record.result.reconciliationRequired=true; }
        catch { record.result.reconciliationRequired = true; }
        timings.confirmationMs=Date.now()-phase;timings.totalMs=Date.now()-started;record.result.timings=timings;record.result.durationMs=timings.totalMs;
        return format(record.result,response);
      } else {
        try {
          stack._currentExecution = { actions: [], dirty: [], atomic: false, trigger: null };
          if (stack._stackIdx > history.index) stack.undo();
        } catch { /* Verify actual content below; never claim an unverified rollback. */ }
        stack._currentExecution = history.execution;
        let after;
        try { after = await read({ includeXml:true }); } catch { /* Preserve any concurrent edit and stop. */ }
        const rolledBack = after?.sha256 === before.sha256;
        if (rolledBack) { stack._stack = history.actions; stack._stackIdx = history.index; }
        else recovery = { requestId, beforeRevision: before.revision, beforeSha256: before.sha256, xml: before.xml };
        record.status = rolledBack ? 'rolled_back' : 'recovery_required';
        record.result = { applied: false, requestId, rolledBack, recoveryRequired: !rolledBack, code: rolledBack ? 'BATCH_ROLLED_BACK' : 'BATCH_RECOVERY_REQUIRED', message: failure.message, causeCode: failure.code || 'EDITOR_ERROR', ...(failure.failedOperation ? { failedOperation: failure.failedOperation } : {}), state: after ? { ...after, xml: undefined } : undefined, ...(recovery ? { recoverySnapshot: recovery } : {}) };
        return format(record.result,response);
      }
    }
    return { batch, apply: runner.apply, recent, recovery: includeXml => recovery ? { ...recovery, xml: includeXml ? recovery.xml : undefined } : null };
  }
  window.NaraMcpBlocks = { create };
})();
