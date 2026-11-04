'use strict';
const byId = id => document.getElementById(id);
function DocumentPalette(palette) {
  this.getPaletteEntries = () => entries => {
    const next = {};
    function addDocuments() {
      for (const format of ['Excel', 'Word', 'Manual', 'Datos']) next['create.project-' + format.toLowerCase()] = {
        group: 'data', className: 'project-document-tool project-document-' + format.toLowerCase(), title: format,
        action: {click: event => beginDocument(event, format), dragstart: event => beginDocument(event, format)}
      };
    }
    function addStage() {
      next['create.project-stage'] = {
        group: 'swimlanes', className: 'project-stage-tool', title: 'Etapa',
        action: {click: event => beginStage(event), dragstart: event => beginStage(event)}
      };
    }
    let added = false;
    for (const [id, entry] of Object.entries(entries)) {
      if (id === 'create.data-object') { addDocuments(); added = true; continue; }
      if (id !== 'create.data-store') {
        next[id] = {...entry};
        if (id === 'create.subprocess-expanded') { next[id].className = 'bpmn-icon-subprocess-collapsed'; next[id].action = {click: event => beginSubprocess(event), dragstart: event => beginSubprocess(event)}; }
        if (/^create\.(start-event|intermediate-event|end-event|exclusive-gateway|task|subprocess-expanded)$/.test(id)) next[id].group='flow';
        if (id==='create.participant-expanded') { next[id].group='swimlanes';addStage(); }
      }
    }
    if (!added) addDocuments();
    if (!next['create.project-stage']) addStage();
    next['create.project-comment']={group:'artifact',className:'bpmn-icon-text-annotation',title:'Comentario',action:{click:event=>beginComment(event),dragstart:event=>beginComment(event)}};
    return next;
  };
  palette.registerProvider(500, this);
}
DocumentPalette.$inject = ['palette'];
const documentPaletteModule = {__init__: ['projectDocumentPalette'], projectDocumentPalette: ['type', DocumentPalette]};
const modeler = new BpmnJS({
  additionalModules: [documentPaletteModule, window.NaraVisualModule,window.NaraEditorTools, window.NaraERModule, window.NaraSheetsModule, window.NaraStyleModule, window.NaraGridModule],
  moddleExtensions: {nara:window.NaraERModdle},
  container: '#canvas',
  textRenderer: {
    defaultStyle: {fontFamily: 'Arial', fontSize: 16},
    externalStyle: {fontFamily: 'Arial', fontSize: 14}
  }
});
window.bpmnModeler = modeler;
const semanticProperties = window.NaraBpmnProperties.mount(modeler, byId('semanticFields'), () => basePropertyDraftPending());
window.NaraAppVersion = '0.12.2';
window.NaraAppBuild = document.querySelector('meta[name=naraflows-build]')?.content || 'unknown';
window.diagramReady = false;
window.diagramError = null;
// Agrupa los cambios nativos para poder deshacer toda la columna en un paso.
function AddStageHandler(modeling, elementFactory, bpmnFactory, canvas, elementRegistry) {
  this.preExecute = context => {
    const current = canvas.getRootElement();
    const stages = elementRegistry.getAll().filter(e => isStage(e) && canvas.findRoot(e) === current).sort((a,b) => a.x-b.x);
    if (context.sourceId) {
      const source = stages.find(e => e.id === context.sourceId);
      if (!source || !['left','right'].includes(context.direction)) throw new Error('Selecciona una etapa de la hoja actual.');
      if(!Number.isFinite(source.width)||!Number.isFinite(source.height)||source.width<20||source.height<20)throw new Error('Ajusta el tamaño de la etapa antes de añadir otra columna.');
      const step = context.direction === 'left' ? -source.width : source.width;
      let x = source.x + step;
      let collision;
      while ((collision=stages.find(e => e.x < x + source.width - 1 && e.x + e.width > x + 1 && e.y < source.y + source.height && e.y + e.height > source.y))) x=context.direction==='left'?collision.x-source.width:collision.x+collision.width;
      if(Math.abs(x)>100000)throw new Error('La columna quedaría fuera del área de modelado.');
      const prefix = activeDiagram?.stagePrefix || 'Stage_';
      let number = 1; while (elementRegistry.get(prefix + 'Etapa_' + number)) number++;
      const shape = elementFactory.createShape({ type:'bpmn:Group', businessObject:bpmnFactory.create('bpmn:Group',{id:prefix+'Etapa_'+number}), width:source.width, height:source.height });
      context.stage = modeling.createShape(shape,{x:x+source.width/2,y:source.y+source.height/2},current);
      return;
    }
    const pools = elementRegistry.getAll().filter(e => e.type === 'bpmn:Participant' && canvas.findRoot(e) === current);
    const first = stages[0], last = stages.at(-1);
    const x = last ? Math.max(...stages.map(e => e.x+e.width)) : pools.length ? Math.min(...pools.map(e => e.x))+60 : 140;
    const y = first ? Math.min(...stages.map(e => e.y)) : pools.length ? Math.min(...pools.map(e => e.y))-64 : 75;
    const bottom = stages.length ? Math.max(...stages.map(e => e.y+e.height)) : pools.length ? Math.max(...pools.map(e => e.y+e.height)) : y+900;
    const width = last?.width || 500, height = Math.max(300,bottom-y);
    const prefix = activeDiagram?.stagePrefix || 'Stage_';
    let number = stages.length+1;
    while (elementRegistry.get(prefix+'Etapa_'+number)) number += 1;
    const shape = elementFactory.createShape({type:'bpmn:Group', businessObject:bpmnFactory.create('bpmn:Group',{id:prefix+'Etapa_'+number}), width, height});
    context.stage = modeling.createShape(shape,{x:x+width/2,y:y+height/2},canvas.getRootElement());
    modeling.resizeShape(context.stage,{x,y,width,height});
    modeling.updateLabel(context.stage,String(number).padStart(2,'0')+' · NUEVA ETAPA');
    for (const pool of pools) {
      if (pool.x+pool.width < x+width) modeling.resizeShape(pool,{x:pool.x,y:pool.y,width:x+width-pool.x,height:pool.height});
    }
    for (const lane of elementRegistry.getAll().filter(e => e.type === 'bpmn:Lane' && canvas.findRoot(e) === current)) {
      if (lane.x+lane.width < x+width) modeling.resizeShape(lane,{x:lane.x,y:lane.y,width:x+width-lane.x,height:lane.height});
    }
  };
  this.execute = () => [];
  this.revert = () => [];
}
AddStageHandler.$inject = ['modeling','elementFactory','bpmnFactory','canvas','elementRegistry'];
modeler.get('commandStack').registerHandler('project.stage.add',AddStageHandler);
function isStage(element) { return element.type === 'bpmn:Group' && element.id.startsWith(activeDiagram?.stagePrefix || 'Stage_'); }
window.NaraStagePrefix = () => activeDiagram?.stagePrefix || 'Stage_';
function beginStage(event) {
  if (!ready) return;
  const registry = modeler.get('elementRegistry');
  const prefix = activeDiagram?.stagePrefix || 'Stage_';
  let number = 1;
  while (registry.get(prefix + 'Etapa_' + number)) number++;
  const root = modeler.get('canvas').getRootElement();
  const pools = (root.children || []).filter(e => e.type === 'bpmn:Participant');
  const height = pools.length ? Math.max(...pools.map(e => e.y + e.height)) - Math.min(...pools.map(e => e.y)) + 48 : 540;
  const businessObject = modeler.get('bpmnFactory').create('bpmn:Group', { id: prefix + 'Etapa_' + number });
  const shape = modeler.get('elementFactory').createShape({ type: 'bpmn:Group', businessObject, width: 260, height });
  modeler.get('create').start(event, shape);
  status('Coloca la columna. Arrastra sus bordes para ajustar el tamaño y haz doble clic para cambiar el nombre.');
}
function appendStage() {
  if (!ready) return;
  try {
    const context = {};
    modeler.get('commandStack').execute('project.stage.add',context);
    modeler.get('selection').select(context.stage);
    togglePanel('right',false); showDetail('properties'); focusStage(context.stage.id);
    byId('elementName').focus(); byId('elementName').select();
    status('Etapa agregada al final. Cambia su nombre en Propiedades y pulsa Aplicar.');
  } catch (error) { status('No se pudo agregar la etapa: '+error.message); }
}
let selected = null;
let ready = false;
window.NaraStartupPending=true;
let dirty = false;
let project = null;
let activeDiagram = null;
let baseSha256 = null;
let sessionToken = '';
let files = [];
let filePolling = false;
let loadingDiagram = false;
let detached = false;
let documentDefaultUse = 'Referencia';
let editSequence = 0;
let browserDocumentVersion = 0;
let saving = false;
let keepDocumentDraft = null;
let documentSelectionId = null;
let standalone = false;
let syncNoticeHandle = null;
const browserFiles = new BrowserBpmnFiles();
window.browserBpmnFiles = browserFiles;
browserFiles.canRelease=()=>!saving&&!loadingDiagram&&!filePolling&&!dirty&&!autoSavePointer&&!modeler.get('directEditing').isActive()&&!window.NaraMicrosoftDialogOpen&&!window.NaraPropertyDraftPending?.();
browserFiles.onMode=()=>{
  const readOnly=browserFiles.readOnly;
  document.body.classList.toggle('file-readonly',readOnly);
  if(byId('fileOwnershipNotice'))byId('fileOwnershipNotice').hidden=!readOnly;
  byId('newSheet').disabled=readOnly;byId('save').disabled=readOnly;refreshActions();
  window.NaraReadOnlyControls?.();window.naraAutoSave?.refresh();
};
window.addEventListener('pageshow',event=>{if(event.persisted)browserFiles.claim().catch(error=>status(error.message));});
window.NaraDocumentIdentity=()=>browserFiles.documentId;
function fileUrl(file) { return file.url; }
async function api(url, options = {}) {
  const response = await fetch(url, {cache:'no-store', ...options});
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 409) showExternalChange(result.error);
    throw Object.assign(new Error(result.error || 'No se pudo completar la operación'),{code:response.status===409?'EXTERNAL_CHANGE':'PROJECT_ERROR'});
  }
  return result;
}
function showExternalChange(message) {
  byId('externalChange').hidden = false;
  byId('externalChangeText').textContent = message || 'El BPMN cambió fuera de esta ventana. Tus cambios locales siguen disponibles.';
  window.naraAutoSave?.block(Object.assign(new Error(message || 'El archivo cambió. Recarga la revisión actual o guarda una copia de tus cambios.'),{code:'EXTERNAL_CHANGE'}));
}
function renderStageNavigation() {
  const nav = byId('stageNavigation'); nav.replaceChildren();
  if(window.NaraER?.active()){nav.hidden=true;return;}
  const all = document.createElement('button'); all.textContent = 'Vista general'; all.dataset.stage = 'all'; all.className = 'active'; all.onclick = fit; nav.appendChild(all);
  const canvas = modeler.get('canvas');
  const stages = modeler.get('elementRegistry').getAll().filter(e => isStage(e) && canvas.findRoot(e) === canvas.getRootElement()).sort((a,b) => a.x-b.x);
  nav.hidden = !stages.length;
  stages.forEach(stage => {
    const button = document.createElement('button'); button.textContent = stageName(stage); button.dataset.stage = stage.id; button.onclick = () => focusStage(stage.id); nav.appendChild(button);
  });
}
function updateProjectContext() {
  byId('diagramTitle').textContent = activeDiagram.title;
  byId('projectName').textContent = project.name;
  byId('diagramTitle').title = 'Proceso: ' + activeDiagram.title;
  document.title = activeDiagram.title + ' · NaraFlows';
  byId('diagramSelect').value = activeDiagram.id;
}
async function loadProjectDiagram(id, allowDiscard = false) {
  if (loadingDiagram || saving) return;
  if (dirty && !allowDiscard && !confirm('Hay cambios sin guardar. ¿Cargar el archivo y descartar esos cambios?')) {
    byId('diagramSelect').value = activeDiagram?.id || '';
    return;
  }
  const next = project.diagrams.find(item => item.id === id);
  if (!next) throw new Error('El diagrama no está registrado en este proyecto');
  loadingDiagram = true; window.diagramReady = false;
  try {
    const result = await api('/api/diagrams/' + id);
    activeDiagram = next; detached = false;
    updateProjectContext();
    await openDiagram(result.xml);
    if (window.diagramError) throw new Error(window.diagramError);
    baseSha256 = result.sha256;
    byId('externalChange').hidden = true;
  } finally { loadingDiagram = false; window.diagramReady = ready; window.naraAutoSave?.reset(); }
}
async function pollFile() {
  if (standalone || detached) { await pollBrowserFile();return; }
  if (filePolling || loadingDiagram || saving || detached || !activeDiagram || !ready) return;
  filePolling = true;
  try {
    const result = await api('/api/diagrams/' + activeDiagram.id);
    if (saving || loadingDiagram || result.sha256 === baseSha256) return;
    if (dirty) showExternalChange();
    else {
      await openDiagram(result.xml);
      if (!window.diagramError) { baseSha256 = result.sha256; status('Diagrama actualizado desde el archivo del proyecto.'); }
    }
  } catch (error) { status('No se pudo comprobar el archivo: ' + error.message); }
  finally { filePolling = false; }
}
async function bootstrap() {
  if (new URLSearchParams(location.search).get('modo')==='archivos' || document.querySelector('meta[name="naraflows-mode"]')?.content==='browser') {await startStandalone();return;}
  // En alojamiento estático no hay API ni catálogo de documentos del cliente.
  const health=await fetch('/api/health',{cache:'no-store'}).catch(()=>null);
  if (!health?.ok || !(health.headers.get('content-type')||'').includes('application/json')) {await startStandalone();return;}
  project = await api('/api/project'); sessionToken = project.token;
  byId('projectName').textContent = project.name;
  byId('diagramSelect').replaceChildren();
  project.diagrams.forEach(item => byId('diagramSelect').appendChild(new Option(item.shortTitle || item.title, item.id)));
  await loadProjectDiagram(project.defaultDiagram || project.diagrams[0].id, true);
  window.projectReady = true;
  setInterval(pollFile, 3000);
}
function browserFileContext(name) {
  detached=true;activeDiagram=null;files=[];baseSha256=null;
  const microsoft = browserFiles.handle?.storageKind === 'microsoft';
  if(syncNoticeHandle&&syncNoticeHandle!==browserFiles.handle){byId('syncNotice').hidden=true;syncNoticeHandle=null;}
  byId('projectName').textContent=microsoft ? 'Microsoft' : 'Archivo';byId('diagramTitle').textContent=name;byId('diagramTitle').title=name;
  document.title=name+' · NaraFlows';
  byId('diagramSelect').hidden=true;byId('reloadDiagram').disabled=!browserFiles.handle;
  byId('fileModeHint').textContent=microsoft ? 'Los cambios se guardan en Microsoft. Exportar BPMN descarga una copia local.' : 'Los cambios se guardan en el archivo autorizado. Guardar como elige otro destino.';
  window.naraAutoSave?.refresh();
}
async function startStandalone() {
  standalone=true;project={name:'',files:[],diagrams:[]};window.fileMode='browser';
  byId('fileModeLink').hidden=true;
  window.NaraInitialDocumentVersion = await newBrowserDiagram(true);window.projectReady=true;setInterval(pollFile,3000);
  if(new URLSearchParams(location.search).get('nuevo')!=='1'){
    try{const source=await browserFiles.localSource();if(source)await acceptBrowserSource(source);}
    catch(error){status('Vuelve a abrir el archivo local para autorizar su recuperación. '+error.message);}
  }else browserFiles.clearCurrent();
  status('Abre un BPMN o crea un proceso. Los archivos se manejan en tu equipo.');
}
async function newBrowserDiagram(force=false) {
  if (!force && (!ready || loadingDiagram || saving || window.NaraMicrosoftOperation)) return status('Espera a que termine la operación del archivo.');
  if (!force && (dirty||window.NaraPropertyDraftPending?.()) && !confirm('Hay cambios sin guardar. ¿Crear otro diagrama y descartarlos?')) return;
  const version = ++browserDocumentVersion;
  loadingDiagram=true;
  try{
    await modeler.createDiagram();modeler.get('modeling').removeElements(modeler.get('elementRegistry').getAll().filter(e=>e.type==='bpmn:StartEvent'));const {xml}=await modeler.saveXML({format:true});
    await browserFiles.attach({name:'Sin título.bpmn',xml,handle:null});
    browserFileContext(browserFiles.name);await openDiagram(xml);byId('externalChange').hidden=true;
    if(!force){window.NaraMicrosoftUI?.clearCurrent();browserFiles.clearCurrent();}
    return version;
  }catch(error){ready=false;window.diagramReady=false;throw error;}
  finally{loadingDiagram=false;window.naraAutoSave?.refresh();}
}
async function acceptBrowserSource(source, canApply = () => true, preserveView = false, savedSource = source) {
  browserFiles.validate(source.xml);
  const previousDirty=dirty;
  const previous=ready ? (await modeler.saveXML({format:true})).xml : null;
  if (!canApply()) return false;
  const canvas=modeler.get('canvas'),er=window.NaraER?.active();
  const view=preserveView?{sheet:er||canvas.getRootElement()?.id,erd:Boolean(er),box:er?window.NaraER.view():canvas.viewbox()}:null;
  browserDocumentVersion++;
  try{await openDiagram(source.xml);}catch(cause){if(previous){await openDiagram(previous);setDirty(previousDirty);}throw cause;}
  await browserFiles.attach(savedSource);browserFileContext(source.name);
  if(source.handle?.storageKind!=='microsoft')window.NaraMicrosoftUI?.clearCurrent();
  if(view&&modeler.get('naraSheets').list().some(sheet=>sheet.id===view.sheet)){
    modeler.get('naraSheets').open(view.sheet);
    if(view.erd)window.NaraER.restoreView(view.box);else canvas.viewbox(view.box);
  }
  byId('externalChange').hidden=true;
  status(browserFiles.handle ? 'Archivo abierto. El guardado automático conserva los cambios aplicados; se detectan cambios externos.' : 'Archivo abierto. Usa Guardar como para elegir destino.');
  return true;
}
async function openBrowserFile() {
  if (!ready || loadingDiagram || saving || window.NaraMicrosoftOperation) return status('Espera a que termine la operación del archivo.');
  browserDocumentVersion++;
  if (!window.showOpenFilePicker) {byId('open').click();return;}
  if ((dirty||window.NaraPropertyDraftPending?.()) && !confirm('Hay cambios sin guardar. ¿Abrir otro archivo y descartarlos?')) return;
  try {await acceptBrowserSource(await browserFiles.pickOpen());}
  catch(error){if(error.name!=='AbortError')status(error.message);}
}
async function saveBrowserFile(saveAs=false,automatic=false,attempt=0) {
  if(window.NaraMicrosoftOperation||saving || loadingDiagram || filePolling || window.NaraMicrosoftDialogOpen)return false;
  if(window.NaraPropertyDraftPending?.()){if(automatic)throw Object.assign(new Error('Termina la edición pendiente para guardar.'),{code:'AUTO_DEFERRED'});status('Aplica o cierra la edición pendiente antes de guardar.');return;}
  const originalHandle=browserFiles.handle,version=browserDocumentVersion;
  if(automatic&&!originalHandle)return false;
  const microsoft=browserFiles.handle?.storageKind==='microsoft';
  if (microsoft && saveAs) {window.NaraMicrosoftUI.saveAs();return;}
  if(!automatic&&!microsoft&&!window.showSaveFilePicker&&(saveAs||!originalHandle)){await exportBpmn();status('Este navegador descarga una copia. El guardado automático local requiere autorizar un archivo en un navegador compatible.');return false;}
  let retry=false;
  try {
    saving=true;window.naraAutoSave?.refresh();
    // El selector debe abrirse desde el clic, antes de preparar el XML.
    const handle=saveAs || !browserFiles.handle ? await browserFiles.pickSave(browserFiles.name) : browserFiles.handle;
    const permission=automatic ? (handle.queryPermission ? await handle.queryPermission({mode:'readwrite'}) : 'granted') : (handle.requestPermission ? await handle.requestPermission({mode:'readwrite'}) : 'granted');
    if(permission!=='granted')throw Object.assign(new Error('Autoriza la escritura con Guardar para activar el guardado automático de este archivo.'),{code:'FILE_PERMISSION_REQUIRED'});
    const sequence=editSequence;
    const canCommit=()=>{
      if(version!==browserDocumentVersion||browserFiles.handle!==originalHandle)return false;
      if(automatic&&window.NaraPropertyDraftPending?.())throw Object.assign(new Error('Termina la edición pendiente para guardar.'),{code:'AUTO_DEFERRED'});
      return true;
    };
    const {xml}=await modeler.saveXML({format:true});await browserFiles.save(xml,handle,{canCommit});
    if(sequence===editSequence)setDirty(false);
    browserFileContext(browserFiles.name);byId('externalChange').hidden=true;
    status((automatic?'Guardado automático':'Archivo guardado')+(microsoft?' en Microsoft · Contenido comprobado.':' en archivo local · Contenido comprobado.'));
    window.naraAutoSave?.reset();return true;
  } catch(error){
    let combined=false;
    if(error.code==='EXTERNAL_CHANGE'&&!saveAs&&originalHandle){
      saving=false;filePolling=true;
      try{
        const source=await browserFiles.read();
        if(version!==browserDocumentVersion||browserFiles.handle!==originalHandle)throw Object.assign(new Error('El archivo cambió durante la sincronización.'),{code:'FILE_CHANGED'});
        combined=await combineBrowserSource(source);
        if(!combined)error=Object.assign(new Error('La sincronización continuará al terminar la edición pendiente.'),{code:'AUTO_DEFERRED'});
      }catch(cause){error=cause;}finally{filePolling=false;}
    }
    if(combined){retry=!automatic&&attempt<2;window.naraAutoSave?.reset();}
    else{
      if(error.code==='EXTERNAL_CHANGE')showExternalChange(error.message);
      if(error.name!=='AbortError'&&error.code!=='AUTO_DEFERRED')status(error.message);
      if(automatic)throw error;
      if(error.name!=='AbortError'&&error.code!=='AUTO_DEFERRED')window.naraAutoSave?.block(error);
    }
  }
  finally{saving=false;window.naraAutoSave?.refresh();}
  if(retry)return saveBrowserFile(false,false,attempt+1);
  return false;
}
async function reloadBrowserFile() {
  if(saving||loadingDiagram||filePolling)return status('Espera a que termine la operación del archivo.');
  if(!browserFiles.handle){status('Abre el archivo de nuevo para leer su última versión.');return;}
  if((dirty||window.NaraPropertyDraftPending?.()) && !confirm('Hay cambios sin guardar. ¿Cargar el archivo y descartarlos?'))return;
  loadingDiagram=true;
  try{await acceptBrowserSource(await browserFiles.read());if(browserFiles.handle?.storageKind==='microsoft')browserFiles.handle.uncertain=false;}catch(error){status(error.message);}finally{loadingDiagram=false;}
}
function browserEditPending(){return Boolean(window.NaraPropertyDraftPending?.()||autoSavePointer||modeler.get('directEditing').isActive()||byId('sheetDialog').open);}
async function combineBrowserSource(source,canApply=()=>true){
  const handle=browserFiles.handle,version=browserDocumentVersion,sequence=editSequence;
  const current=()=>handle&&browserFiles.handle===handle&&browserDocumentVersion===version&&sequence===editSequence&&!saving&&ready&&!browserEditPending()&&canApply();
  if(!current())return false;
  const {xml:local}=await modeler.saveXML({format:true});
  if(!current())return false;
  let result;
  try{result=window.NaraBpmnMerge.merge(browserFiles.baseXml,local,source.xml);}
  catch(error){if(error.code!=='MERGE_INVALID')throw error;result={xml:source.xml,conflicts:[{path:'document'}],hasLocalChanges:false};}
  if(result.hasLocalChanges){
    try{const parsed=await modeler.get('moddle').fromXML(result.xml);if(parsed.warnings.length)throw new Error('Referencias pendientes.');}
    catch{result={xml:source.xml,conflicts:[{path:'references'}],hasLocalChanges:false};}
  }
  if(!current())return false;
  const recovery=result.conflicts.length?await browserFiles.preserveRecovery(local,handle):null;
  if(!current())return false;
  loadingDiagram=true;
  try{
    if(!await acceptBrowserSource({...source,xml:result.xml},current,true,source))return false;
    if(handle.storageKind==='microsoft'){
      try{handle.store.assertAccount(handle.accountId);}
      catch(error){if(browserFiles.handle===handle){browserFiles.handle=null;browserFiles.hash=null;browserFileContext(browserFiles.name);setDirty(true);}throw error;}
    }
    setDirty(result.hasLocalChanges);window.naraAutoSave?.reset();
    if(recovery){
      syncNoticeHandle=handle;byId('syncNotice').hidden=false;
      byId('syncNoticeText').textContent='Cambios sincronizados. Para los cambios incompatibles se mantuvo el valor compartido. Tu versión completa está en '+(recovery.storage==='microsoft'?'la misma carpeta de Microsoft: ':'Historial local: ')+recovery.name;
    }
    status(result.hasLocalChanges?'Cambios combinados automáticamente. Guardado pendiente.':'Cambios sincronizados automáticamente.');
    return true;
  }finally{loadingDiagram=false;window.naraAutoSave?.refresh();}
}
async function pollBrowserFile() {
  if(window.NaraMicrosoftOperation || !browserFiles.handle || filePolling || loadingDiagram || saving || !ready || autoSavePointer || modeler.get('directEditing').isActive())return;
  const handle=browserFiles.handle,version=browserDocumentVersion,sequence=editSequence;
  const microsoft=handle.storageKind==='microsoft';
  if(microsoft) {
    if(document.visibilityState==='hidden' || window.NaraMicrosoftDialogOpen || Date.now()-(handle.lastPoll||0)<(handle.pollDelay||15000))return;
    handle.lastPoll=Date.now();
  }
  filePolling=true;
  try{
    const source=await browserFiles.read({onlyChanged:true});
    const same=()=>browserFiles.handle===handle&&browserDocumentVersion===version;
    if(!same() || saving || loadingDiagram)return;
    handle.pollDelay=15000;
    window.naraAutoSave?.retrySafe();
    if(!source)return;
    if(source.hash===browserFiles.hash){if(microsoft)browserFiles.version=handle.etag;return;}
    const canUpdate=()=>same()&&!saving&&editSequence===sequence&&!browserEditPending();
    if(!canUpdate())status('Hay cambios compartidos pendientes. Se combinarán al terminar tu edición.');
    else if(dirty)await combineBrowserSource(source,canUpdate);
    else if(await acceptBrowserSource(source,canUpdate,true))status(microsoft?'Cambios de Microsoft actualizados automáticamente.':'Cambios del archivo actualizados automáticamente.');
  }catch(error){
    if(browserFiles.handle!==handle||browserDocumentVersion!==version)return;
    if(microsoft)handle.pollDelay=error.code==='THROTTLED'?Math.max(error.retryAfterMs||60000,15000):Math.min((handle.pollDelay||15000)*2,120000);
    status('No se pudo comprobar si hay cambios. Se volverá a intentar. '+error.message);
  }finally{filePolling=false;window.naraAutoSave?.refresh();}
}
async function showHistory() {
  const items=byId('historyItems');items.replaceChildren();
  try{
    const revisions=await browserFiles.revisions({legacy:Boolean(byId('historyLegacy')?.checked)});
    if(!revisions.length)items.textContent='Todavía no hay revisiones de archivos guardados desde este navegador.';
    for(const revision of revisions){const row=document.createElement('div');row.className='history-row';const label=document.createElement('span');label.textContent=revision.name+' · '+new Date(revision.date).toLocaleString();const button=document.createElement('button');button.textContent='Descargar copia';button.onclick=()=>download(revision.xml,'application/xml',revision.name.replace(/\.bpmn$/i,'')+'_anterior.bpmn');row.append(label,button);items.appendChild(row);}
    byId('historyDialog').showModal();
  }catch(error){status('No se pudo abrir el historial: '+error.message);}
}
function status(message) { byId('status').textContent = message; }
function setDirty(value) {
  dirty = value;
  byId('dirtyState').textContent = value ? 'Cambios sin guardar' : 'Sin cambios pendientes';
  byId('dirtyState').classList.toggle('dirty', value);
  window.naraAutoSave?.refresh(value);
}
function showRibbon(name) {
  setRibbonCollapsed(false);
  document.querySelectorAll('[data-ribbon]').forEach(button => {
    const active = button.dataset.ribbon === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-content]').forEach(panel => panel.hidden = panel.dataset.content !== name);
}
function setRibbonCollapsed(collapsed) {
  byId('ribbon').hidden = collapsed;
  byId('toggleRibbon').textContent = collapsed ? '⌄' : '⌃';
  byId('toggleRibbon').setAttribute('aria-expanded', String(!collapsed));
  const label = collapsed ? 'Expandir barra superior' : 'Minimizar barra superior';
  byId('toggleRibbon').setAttribute('aria-label', label); byId('toggleRibbon').title = label;
  requestAnimationFrame(() => {modeler.get('canvas').resized();if(window.NaraER?.active())window.NaraER.resize();});
}
function showDetail() {
  if(document.body.classList.contains('focus-mode'))focusCanvas(false);
  byId('workspace').classList.remove('right-hidden');
  byId('rightPanel').hidden = false;
  byId('showRight').hidden = true;
  if (innerWidth <= 850) byId('workspace').classList.add('mobile-detail');
  byId('propertiesPanel').hidden = !!window.NaraER?.active();
  byId('erdPropertiesPanel').hidden = !window.NaraER?.active();
  if(window.NaraER?.active())window.NaraER.renderProperties();
  window.NaraStylePanel?.setTab('properties');
  requestAnimationFrame(() => {modeler.get('canvas').resized();if(window.NaraER?.active())window.NaraER.resize();});
}
function togglePanel(side, explicit) {
  const workspace = byId('workspace');
  const hidden = explicit === undefined ? !workspace.classList.contains(side + '-hidden') : explicit;
  workspace.classList.toggle(side + '-hidden', hidden);
  byId(side + 'Panel').hidden = hidden;
  byId(side === 'left' ? 'showLeft' : 'showRight').hidden = !hidden;
  if(side==='left'&&!hidden&&innerWidth<=850&&workspace.classList.contains('mobile-detail')){workspace.classList.remove('mobile-detail');workspace.classList.add('right-hidden');byId('rightPanel').hidden=true;byId('showRight').hidden=false;}
  if (side === 'right' && hidden) workspace.classList.remove('mobile-detail');
  requestAnimationFrame(() => {modeler.get('canvas').resized();if(window.NaraER?.active())window.NaraER.resize();});
}
function markStage(id) {
  document.querySelectorAll('[data-stage]').forEach(button => button.classList.toggle('active', button.dataset.stage === id));
}
function fit() {
  if(window.NaraER?.active()){window.NaraER.fit();return;}
  modeler.get('canvas').zoom('fit-viewport', 'auto');
  markStage('all');
}
function focusStage(id) {
  if (id === 'all') { fit(); return; }
  const stage = modeler.get('elementRegistry').get(id);
  if (!stage) { status('Esta etapa no está en el modelo abierto.'); return; }
  const canvas = modeler.get('canvas');
  const size = canvas.getSize();
  const zoom = Math.min(0.95, (size.width - 70) / (stage.width + 40));
  canvas.zoom(zoom);
  const view = canvas.viewbox();
  canvas.viewbox({x: stage.x - (view.width - stage.width) / 2, y: stage.y - 40, width: view.width, height: view.height});
  markStage(id);
}
function zoom(value) {
  if(window.NaraER?.active()){window.NaraER.zoom(value);return;}
  const canvas = modeler.get('canvas');
  canvas.zoom(Math.max(0.1, Math.min(2, value)));
  markStage('');
}
function mountPalette() {
  const palette = document.querySelector('#canvas .djs-palette') || document.querySelector('#paletteHost .djs-palette');
  if (palette) byId('paletteHost').appendChild(palette);
  const labels = {
    'hand-tool': 'Desplazar', 'lasso-tool': 'Seleccionar', 'space-tool': 'Espacio', 'global-connect-tool': 'Conectar',
    'create.start-event': 'Inicio', 'create.intermediate-event': 'Intermedio', 'create.end-event': 'Fin',
    'create.exclusive-gateway': 'Decisión', 'create.task': 'Tarea', 'create.subprocess-expanded': 'Subproceso',
    'create.data-object': 'Documento', 'create.data-store': 'Datos', 'create.participant-expanded': 'Participante', 'create.group': 'Grupo', 'create.project-stage': 'Etapa', 'create.project-comment': 'Comentario'
  };
  document.querySelectorAll('#paletteHost .entry').forEach(entry => {
    const label = labels[entry.dataset.action] || entry.title;
    entry.dataset.label = label;
    entry.title = entry.dataset.action === 'create.project-stage' ? 'Etapa · arrastrar una columna al diagrama' : label;
    entry.setAttribute('aria-label', label);
    if (window.NaraPaletteIcons[label] && !entry.querySelector('.palette-line-icon')) {
      const icon = document.createElement('span'); icon.className = 'palette-line-icon'; icon.innerHTML = window.NaraPaletteIcons[label]; entry.prepend(icon);
    }
  });
  const attribution = document.querySelector('#canvas .bjs-powered-by') || document.querySelector('#attributionHost .bjs-powered-by');
  if (attribution) byId('attributionHost').appendChild(attribution);
}
const documentFormats = new Set(['Excel','Word','Manual','Datos','Documento']);
function isDocument(el) { return el && ['bpmn:DataObjectReference', 'bpmn:DataStoreReference'].includes(el.type); }
function documentInfo(el) {
  const parts = (el.businessObject.dataState?.name || '').split(' · ');
  return {format: documentFormats.has(parts[0]) ? parts[0] : 'Documento', use: ['Entrada', 'Salida', 'Entrada/Salida', 'Referencia'].includes(parts[1]) ? parts[1] : 'Referencia'};
}
function documentState(format, use) {
  return modeler.get('bpmnFactory').create('bpmn:DataState', {name: format + ' · ' + use});
}
function beginDocument(event, format) {
  const shape = modeler.get('elementFactory').createShape({type: format === 'Datos' ? 'bpmn:DataStoreReference' : 'bpmn:DataObjectReference'});
  shape.businessObject.name = format === 'Manual' ? 'Documento manual' : format === 'Datos' ? 'Datos' : 'Archivo ' + format;
  shape.businessObject.dataState = documentState(format, documentDefaultUse);
  shape.businessObject.dataState.$parent = shape.businessObject;
  modeler.get('create').start(event, shape);
  status('Coloca el documento y selecciona Entrada o Salida en Propiedades.');
}
function beginComment(event) {
  const shape=modeler.get('elementFactory').createShape({type:'bpmn:TextAnnotation'});
  shape.businessObject.text='Comentario';modeler.get('create').start(event,shape);
  status('Coloca el comentario. Puedes editarlo en Propiedades y conectarlo con una asociación.');
}
function beginSubprocess(event) {
  const shape = modeler.get('elementFactory').createShape({type: 'bpmn:SubProcess', isExpanded: false});
  shape.businessObject.name = 'Subproceso';
  modeler.get('create').start(event, shape);
  status('Coloca el subproceso. Haz doble clic para abrir su hoja de detalle.');
}
function decorateDocuments() {
  // DocumentSymbols renders the same vectors as the palette through bpmn-js.
}
function populateDocumentActivities() {
  const target = byId('documentActivity'); target.replaceChildren(new Option('Seleccionar actividad', ''));
  const canvas = modeler.get('canvas');
  for (const el of modeler.get('elementRegistry').getAll().filter(e => /Task$/.test(e.type) && canvas.findRoot(e) === canvas.getRootElement())) target.appendChild(new Option((el.businessObject.name || el.id).replaceAll('\n', ' '), el.id));
}
function linkDocument() {
  if (!isDocument(selected)) return;
  const registry = modeler.get('elementRegistry'), activity = registry.get(byId('documentActivity').value);
  if (!activity) { status('Selecciona la actividad relacionada.'); return; }
  const use = byId('documentUse').value;
  const info = documentInfo(selected), format = byId('documentFormat').value;
  if (format !== info.format || use !== info.use) modeler.get('modeling').updateProperties(selected, {dataState: documentState(format, use)});
  const directions = use === 'Salida' ? [[activity, selected]] : use === 'Entrada/Salida' ? [[selected, activity], [activity, selected]] : [[selected, activity]];
  const modeling = modeler.get('modeling');
  try {
    for (const [source, target] of directions) {
      if (registry.getAll().some(e => e.source?.id === source.id && e.target?.id === target.id)) continue;
      if (use === 'Referencia') modeling.connect(source, target, {type: 'bpmn:Association', associationDirection: 'None'});
      else modeling.connect(source, target);
    }
    status('Documento vinculado a la actividad. Guarda una copia BPMN para conservarlo.');
  } catch (error) { status('No se pudo vincular: ' + error.message); }
}
function applyDocumentControls() {
  if (!isDocument(selected)) return;
  const document = selected;
  const format = byId('documentFormat').value, use = byId('documentUse').value;
  documentDefaultUse = use;
  keepDocumentDraft = {id:document.id, name:byId('elementName').value, description:byId('elementDocumentation').value};
  const registry = modeler.get('elementRegistry'), modeling = modeler.get('modeling');
  const relations = registry.getAll().filter(e => e.source && e.target && ((e.source.id === document.id && /Task$/.test(e.target.type)) || (e.target.id === document.id && /Task$/.test(e.source.type))) && ['bpmn:DataInputAssociation','bpmn:DataOutputAssociation','bpmn:Association'].includes(e.type));
  const activities = [...new Set(relations.map(e => e.source.id === document.id ? e.target.id : e.source.id))];
  modeling.updateProperties(document, {dataState:documentState(format,use)});
  relations.forEach(connection => modeling.removeConnection(connection));
  for (const id of activities) {
    const task = registry.get(id);
    if (use === 'Entrada' || use === 'Entrada/Salida') modeling.connect(document, task);
    if (use === 'Salida' || use === 'Entrada/Salida') modeling.connect(task, document);
    if (use === 'Referencia') modeling.connect(document, task, {type:'bpmn:Association',associationDirection:'None'});
  }
  decorateDocuments();
  status('Uso actualizado: ' + use + (activities.length ? ' · Dirección de conexiones actualizada.' : ' · Elige una actividad y pulsa Conectar con la actividad.'));
}
function stageName(stage) {
  return stage.businessObject.categoryValueRef?.value || stage.businessObject.categoryValue?.value || stage.businessObject.name || '';
}
function decorateStages() {
  const registry=modeler.get('elementRegistry'),canvas=modeler.get('canvas'),NS='http://www.w3.org/2000/svg',layer=canvas.getActiveLayer();
  if(!layer)return;
  let backgrounds=layer.querySelector(':scope > .nara-stage-backgrounds');
  if(!backgrounds){backgrounds=document.createElementNS(NS,'g');backgrounds.setAttribute('class','nara-stage-backgrounds');backgrounds.setAttribute('pointer-events','none');}
  // Keep column fills behind activities and participants, also in SVG/PNG exports.
  layer.prepend(backgrounds);backgrounds.replaceChildren();
  for(const el of registry.getAll().filter(isStage)){
    const gfx=registry.getGraphics(el),visual=gfx?.querySelector('.djs-visual');if(!visual)continue;
    const style=window.NaraStylePanel?.read(el)||{},stroke=style.stroke||el.di?.stroke||'#22242a',fill=style.fill||el.di?.fill||'#ffffff';gfx.classList.add('nara-stage');
    if(canvas.findRoot(el)===canvas.getRootElement()){const background=document.createElementNS(NS,'rect');for(const [key,value]of Object.entries({x:el.x,y:el.y,width:el.width,height:el.height,fill,'fill-opacity':.95}))background.setAttribute(key,value);background.dataset.stageBackground=el.id;backgrounds.appendChild(background);}
    const outline=visual.querySelector('rect:not(.stage-header-fill)');
    if(outline){for(const [key,value]of Object.entries({fill:'none',stroke,'stroke-width':style.strokeWidth||1.5,'stroke-dasharray':'none',rx:0,ry:0}))outline.setAttribute(key,value);Object.assign(outline.style,{fill:'none',stroke,strokeWidth:(style.strokeWidth||1.5)+'px',strokeDasharray:'none'});}
    let header=visual.querySelector('.stage-header-fill');if(!header){header=document.createElementNS(NS,'rect');header.classList.add('stage-header-fill');visual.insertBefore(header,visual.firstChild);}
    for(const [key,value]of Object.entries({x:0,y:0,width:el.width,height:30,fill,'fill-opacity':.95,stroke,'stroke-width':style.strokeWidth||1.5}))header.setAttribute(key,value);
    let hit=gfx.querySelector('.nara-stage-header-hit');if(!hit){hit=document.createElementNS(NS,'rect');hit.setAttribute('class','djs-hit djs-hit-all nara-stage-header-hit');gfx.appendChild(hit);}for(const [key,value]of Object.entries({x:0,y:0,width:el.width,height:30,fill:'transparent','pointer-events':'all'}))hit.setAttribute(key,value);
    // Labels use the native Group category and native editing; place their visual inside the column header.
    const label=registry.get(el.id+'_label'),labelGfx=label?registry.getGraphics(label):null;
    if(labelGfx){labelGfx.classList.add('nara-stage-label');labelGfx.querySelectorAll('text').forEach(t=>{t.style.fill=style.fontColor||'#22242a';t.style.fontSize=(style.fontSize||16)+'px';t.style.fontWeight=style.bold?'700':'400';});const box=labelGfx.querySelector('.djs-visual')?.getBBox();if(box)labelGfx.setAttribute('transform',`translate(${el.x+el.width/2-box.x-box.width/2},${el.y+15-box.y-box.height/2})`);}
  }
}
function roleFor(el) {
  const lanes = modeler.get('elementRegistry').getAll().filter(e => e.type === 'bpmn:Lane' && (e.businessObject.flowNodeRef || []).some(ref => ref.id === el.id));
  if (lanes.length) return lanes.map(e => e.businessObject.name).join(' / ');
  if (el.type === 'bpmn:Lane') return el.businessObject.name;
  return '—';
}
function phaseFor(el) {
  const x = el.x + (el.width || 0) / 2;
  const canvas = modeler.get('canvas');
  const phase = modeler.get('elementRegistry').getAll().find(e => e.type === 'bpmn:Group' && canvas.findRoot(e) === canvas.findRoot(el) && e.id.startsWith(activeDiagram?.stagePrefix || 'Stage_') && x >= e.x && x < e.x + e.width);
  return phase ? stageName(phase) : '—';
}
function updateProperties(el) {
  selected = el && el.businessObject ? el : null;
  byId('emptySelection').hidden = Boolean(selected);
  byId('propertyForm').hidden = !selected;
  byId('delete').disabled = !selected;
  semanticProperties.render(selected);
  if (!selected) return;
  const bo = selected.businessObject;
  const typeNames = {'bpmn:ManualTask': 'Tarea manual', 'bpmn:Task': 'Tarea', 'bpmn:UserTask': 'Tarea de usuario', 'bpmn:ServiceTask': 'Tarea de servicio', 'bpmn:ScriptTask': 'Tarea de script', 'bpmn:BusinessRuleTask': 'Tarea de reglas de negocio', 'bpmn:SendTask': 'Tarea de envío', 'bpmn:ReceiveTask': 'Tarea de recepción', 'bpmn:ExclusiveGateway': 'Decisión exclusiva', 'bpmn:InclusiveGateway': 'Decisión inclusiva', 'bpmn:ParallelGateway': 'Compuerta paralela', 'bpmn:EventBasedGateway': 'Compuerta por eventos', 'bpmn:ComplexGateway': 'Compuerta compleja', 'bpmn:StartEvent': 'Evento de inicio', 'bpmn:EndEvent': 'Evento de fin', 'bpmn:IntermediateThrowEvent': 'Evento intermedio de salida', 'bpmn:IntermediateCatchEvent': 'Evento intermedio de entrada', 'bpmn:BoundaryEvent': 'Evento de borde', 'bpmn:SequenceFlow': 'Flujo de secuencia', 'bpmn:MessageFlow': 'Flujo de mensaje', 'bpmn:SubProcess': 'Subproceso', 'bpmn:CallActivity': 'Actividad reutilizable', 'bpmn:DataObjectReference': 'Documento', 'bpmn:DataStoreReference': 'Datos', 'bpmn:Lane': 'Carril', 'bpmn:Group': isStage(selected) ? 'Etapa' : 'Grupo', 'bpmn:Participant': 'Participante', 'bpmn:TextAnnotation': 'Nota'};
  const name = selected.type === 'bpmn:Group' ? stageName(selected) : selected.type === 'bpmn:TextAnnotation' ? bo.text : bo.name || '';
  byId('elementType').textContent = typeNames[selected.type] || selected.type.replace('bpmn:', '');
  byId('propertyHeading').textContent = name.replaceAll('\n', ' ') || 'Elemento sin nombre';
  byId('elementName').value = name;
  byId('elementDocumentation').value = (bo.documentation || []).map(d => d.text || '').join('\n\n');
  byId('elementRole').textContent = roleFor(selected);
  byId('elementStage').textContent = phaseFor(selected);
  byId('documentFields').hidden = !isDocument(selected);
  const subprocess = ['bpmn:SubProcess','bpmn:CallActivity'].includes(selected.type);
  byId('subprocessFields').hidden = !subprocess;
  if (subprocess) {
    const target = byId('subprocessTarget'), sheets = modeler.get('naraSheets').list();
    const previous = target.value;
    target.replaceChildren(new Option('Seleccionar hoja de proceso', ''));
    sheets.filter(sheet => sheet.processId).forEach(sheet => target.appendChild(new Option(sheet.name, sheet.id)));
    target.value = sheets.find(sheet => sheet.processId === bo.calledElement)?.id || previous;
    byId('linkSubprocess').disabled = !sheets.some(sheet => sheet.processId);
  }
  if (isDocument(selected)) {
    const info = documentInfo(selected);
    byId('documentFormat').value = info.format; byId('documentUse').value = info.use;
    const previousActivity = byId('documentActivity').value;
    const sameDocument = documentSelectionId === selected.id;
    const related = [...new Set(modeler.get('elementRegistry').getAll().filter(e => e.source && e.target && ((e.source.id === selected.id && /Task$/.test(e.target.type)) || (e.target.id === selected.id && /Task$/.test(e.source.type)))).map(e => e.source.id === selected.id ? e.target.id : e.source.id))];
    populateDocumentActivities();
    byId('documentActivity').value = sameDocument && previousActivity ? previousActivity : related.length === 1 ? related[0] : '';
    documentSelectionId = selected.id;
  } else {
    documentSelectionId = null;
  }
}
function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function exportBpmn() {
  if(window.NaraPropertyDraftPending?.())throw new Error('Aplica o cierra la edición pendiente antes de exportar.');
  const {xml} = await modeler.saveXML({format: true});
  download(xml, 'application/xml', activeDiagram ? activeDiagram.exportName+'.bpmn' : browserFiles.name);
  status('Copia BPMN exportada.');
}
async function saveBpmn(automatic=false) {
  if(saving)return false;
  if(window.NaraPropertyDraftPending?.())throw Object.assign(new Error('Aplica o cierra la edición pendiente antes de guardar.'),{code:automatic?'AUTO_DEFERRED':'PENDING_DRAFT'});
  if (standalone || detached || !activeDiagram) return saveBrowserFile(false,automatic);
  const sequence = editSequence;
  saving = true;
  try {
    const {xml} = await modeler.saveXML({format: true});
    const result = await api('/api/diagrams/' + activeDiagram.id, {method:'POST', headers:{'Content-Type':'application/json','X-Modelador-Token':sessionToken}, body:JSON.stringify({xml,baseSha256})});
    baseSha256 = result.sha256;
    if (editSequence === sequence) setDirty(false);
    byId('externalChange').hidden = true;
    status('Guardado en el proyecto' + (result.historyCreated ? ' · Revisión anterior conservada en historial.' : '.') + (dirty ? ' Hay cambios nuevos pendientes.' : ''));window.naraAutoSave?.reset();return true;
  } finally { saving = false;window.naraAutoSave?.refresh(); }
}
async function exportSvg() {
  if(window.NaraPropertyDraftPending?.())throw new Error('Aplica o cierra la edición pendiente antes de exportar.');
  decorateStages(); const svg = window.NaraER?.active() ? window.NaraER.exportSvg() : (await modeler.saveSVG()).svg;
  download(svg, 'image/svg+xml', (activeDiagram?.exportName || 'diagrama') + '.svg'); status('Imagen SVG exportada.');
}
async function exportPng() {
  if(window.NaraPropertyDraftPending?.())throw new Error('Aplica o cierra la edición pendiente antes de exportar.');
  decorateStages(); const svg = window.NaraER?.active() ? window.NaraER.exportSvg() : (await modeler.saveSVG()).svg;
  const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
  try {
    const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth * 2; canvas.height = image.naturalHeight * 2;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => { if (blob) { download(blob, 'image/png', (activeDiagram?.exportName || 'diagrama') + '.png'); status('Imagen PNG exportada.'); } }, 'image/png');
  } finally { URL.revokeObjectURL(url); }
}
async function openDiagram(xml) {
  ready = false; window.diagramReady = false; window.diagramError = null;
  try {
    const result = await modeler.importXML(xml);
    const additionalWarnings = await modeler.get('naraSheets').importAdditional();
    window.importWarnings = [...(result.warnings || []), ...additionalWarnings];
    mountPalette(); decorateStages(); decorateDocuments(); renderStageNavigation(); fit(); updateProperties(null); setDirty(false);
    ready = true; window.diagramReady = true;
    status('Modelo editable · ' + window.importWarnings.length + ' advertencias de importación · Revisión del proceso pendiente');
    refreshActions();
  } catch (error) { window.diagramError = error.message; status('No se pudo abrir: ' + error.message); throw error; }
}
window.openDiagram = openDiagram;
window.decorateStages = decorateStages;
window.decorateDocuments = decorateDocuments;
function refreshActions() {
  const stack = modeler.get('commandStack'); byId('undo').disabled = browserFiles.readOnly||!stack.canUndo(); byId('redo').disabled = browserFiles.readOnly||!stack.canRedo();
}
let focusState=null;
function updateFocusSheet(){const id=window.NaraER?.active()||modeler.get('canvas').getRootElement()?.id;byId('focusSheet').textContent=modeler.get('naraSheets').list().find(s=>s.id===id)?.name||'';}
function renderFocusControl(enabled){
  const button=byId('focusCanvas'),label=enabled?'Salir de vista ampliada':'Ampliar lienzo';
  const corners=enabled?'M3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3':'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5';
  button.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+corners+'"/></svg>';
  button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(enabled));
}
function focusCanvas(enabled=!document.body.classList.contains('focus-mode')){
  if(enabled===document.body.classList.contains('focus-mode'))return;
  if(enabled)focusState={sheet:window.NaraER?.active()||modeler.get('canvas').getRootElement()?.id,erView:window.NaraER?.view(),bpmnView:modeler.get('canvas').viewbox()};
  document.body.classList.toggle('focus-mode',enabled);renderFocusControl(enabled);byId('focusSheet').hidden=!enabled;updateFocusSheet();
  requestAnimationFrame(()=>{modeler.get('canvas').resized();if(window.NaraER?.active())window.NaraER.resize();if(!enabled&&focusState){const id=window.NaraER?.active()||modeler.get('canvas').getRootElement()?.id;if(id===focusState.sheet){if(window.NaraER?.active())window.NaraER.restoreView(focusState.erView);else modeler.get('canvas').viewbox(focusState.bpmnView);}focusState=null;}});
}
byId('focusCanvas').onclick=()=>focusCanvas();byId('focusCanvasRibbon').onclick=()=>focusCanvas(true);
renderFocusControl(false);
window.NaraSetFocus=focusCanvas;window.NaraExpandedCanvas=()=>document.body.classList.contains('focus-mode');
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('focus-mode')&&!document.querySelector('dialog[open],.djs-popup'))focusCanvas(false);});
document.querySelectorAll('[data-ribbon]').forEach(button => button.onclick = () => showRibbon(button.dataset.ribbon));
byId('toggleRibbon').onclick = () => setRibbonCollapsed(!byId('ribbon').hidden);
byId('documentUse').onchange = applyDocumentControls;
byId('documentFormat').onchange = applyDocumentControls;
byId('connectDocument').onclick = linkDocument;
document.querySelectorAll('[data-fit]').forEach(button => button.onclick = fit);
document.querySelectorAll('[data-stage]').forEach(button => button.onclick = () => focusStage(button.dataset.stage));
byId('properties').onclick = () => showDetail('properties');
byId('toggleLeft').onclick = () => togglePanel('left'); byId('hideLeft').onclick = () => togglePanel('left', true); byId('showLeft').onclick = () => togglePanel('left', false);
byId('toggleRight').onclick = () => togglePanel('right'); byId('hideRight').onclick = () => togglePanel('right', true); byId('showRight').onclick = () => { togglePanel('right', false); showDetail('properties'); };
byId('undo').onclick = () => {if(window.NaraPropertyDraftPending?.())status('Aplica o cierra la edición pendiente antes de deshacer.');else modeler.get('commandStack').undo();}; byId('redo').onclick = () => {if(window.NaraPropertyDraftPending?.())status('Aplica o cierra la edición pendiente antes de rehacer.');else modeler.get('commandStack').redo();};
byId('delete').onclick = () => { if(window.NaraER?.active())window.NaraER.deleteSelection();else if (selected) modeler.get('modeling').removeElements([selected]); };
byId('plus').onclick = () => zoom((window.NaraER?.active()?window.NaraER.scale():modeler.get('canvas').zoom()) * 1.2); byId('minus').onclick = () => zoom((window.NaraER?.active()?window.NaraER.scale():modeler.get('canvas').zoom()) / 1.2);
byId('actualSize').onclick = () => zoom(1); byId('zoomValue').onclick = fit; byId('zoomRange').oninput = event => zoom(Number(event.target.value) / 100);
byId('save').onclick = () => saveBpmn().catch(error => status(error.message));
byId('saveAs').onclick = () => saveBrowserFile(true);
byId('newFile').onclick = () => newBrowserDiagram().catch(error=>status(error.message));
byId('openFile').onclick = openBrowserFile;
byId('fileHistory').onclick = showHistory;
byId('closeHistory').onclick = () => byId('historyDialog').close();
byId('exportBpmn').onclick = () => exportBpmn().catch(error => status(error.message));
byId('diagramSelect').onchange = event => loadProjectDiagram(event.target.value).catch(error => status(error.message));
byId('reloadDiagram').onclick = () => (detached ? reloadBrowserFile() : loadProjectDiagram(activeDiagram?.id || project.defaultDiagram)).catch(error => status(error.message));
byId('exportLocalChanges').onclick = () => exportBpmn().catch(error => status(error.message));
byId('loadDiskChanges').onclick = () => (detached ? reloadBrowserFile() : loadProjectDiagram(activeDiagram?.id || project.defaultDiagram)).catch(error => status(error.message));
byId('closeSyncNotice').onclick=()=>{byId('syncNotice').hidden=true;syncNoticeHandle=null;};
byId('exportSvg').onclick = () => exportSvg().catch(error => status(error.message));
byId('exportPng').onclick = () => exportPng().catch(error => status(error.message));
byId('open').onchange = async event => {
  if(saving||loadingDiagram){event.target.value='';return status('Espera a que termine la operación del archivo.');}
  const file = event.target.files[0];
  if (file) browserDocumentVersion++;
  if (file && (!(dirty||window.NaraPropertyDraftPending?.()) || confirm('Hay cambios sin guardar. ¿Abrir el archivo y descartar esos cambios?'))) {
    try{await acceptBrowserSource({name:file.name,xml:await file.text(),handle:null});}catch(error){status(error.message);}
  }
  event.target.value = '';
};
function applyProperties() {
  if (!selected || !basePropertyDraftPending() && !semanticProperties.pending()) return false;
  if (!byId('propertyForm').checkValidity()) throw Error('Completa los campos indicados para aplicar el cambio.');
  const semanticChanges = semanticProperties.prepare();
  keepDocumentDraft = null;
  const modeling = modeler.get('modeling');
  semanticProperties.transaction(() => {
  const previousName=selected.type==='bpmn:TextAnnotation'?selected.businessObject.text||'':selected.type==='bpmn:Group'?stageName(selected):selected.businessObject.name||'';
  if(byId('elementName').value!==previousName){
    if (selected.type === 'bpmn:TextAnnotation') modeling.updateProperties(selected, {text: byId('elementName').value});
    else modeling.updateLabel(selected, byId('elementName').value);
  }
  const description = byId('elementDocumentation').value;
  const previousDescription = (selected.businessObject.documentation || []).map(d => d.text || '').join('\n\n');
  if (isDocument(selected)) {
    const format = byId('documentFormat').value, use = byId('documentUse').value, info = documentInfo(selected);
    if (format !== info.format || use !== info.use) modeling.updateProperties(selected, {dataState: documentState(format, use)});
  }
  if (description !== previousDescription) {
    const documentation = description ? [modeler.get('moddle').create('bpmn:Documentation', {text: description})] : [];
    modeling.updateProperties(selected, {documentation});
  }
  for (const apply of semanticChanges) apply();
  });
  decorateStages(); decorateDocuments(); updateProperties(selected); return true;
}
window.NaraApplyProperties=applyProperties;
window.NaraWorkspaceFile=()=>({name:browserFiles.name,cloud:browserFiles.handle?.storageKind==='microsoft',document:browserDocumentVersion,documentId:browserFiles.documentId,readOnly:browserFiles.readOnly,account:window.NaraMicrosoftUI?.accountName()||'',location:browserFiles.handle?.storageKind==='microsoft'?(window.NaraMicrosoftUI?.location()||'Microsoft'):browserFiles.handle?'Este equipo · archivo autorizado':'Sin ubicación · elige dónde guardar'});
window.NaraRefreshProperties=()=>updateProperties(selected);
byId('propertyForm').onsubmit = event => {
  event.preventDefault();try{applyProperties();}catch(error){status(error.message);}
};
const eventBus = modeler.get('eventBus');
eventBus.on('commandStack.canExecute',2000,()=>{if(browserFiles.readOnly&&!loadingDiagram)return false;});
eventBus.on(['commandStack.preExecute','commandStack.revert'],2000,()=>{if(!loadingDiagram)browserFiles.assertWritable();});
byId('takeFileEditing').onclick=async()=>{
  try{await browserFiles.takeEditing();await reloadBrowserFile();status('Edición transferida a esta pestaña. Archivo actualizado.');}
  catch(error){status(error.message);}
};
byId('historyLegacy').onchange=()=>showHistory();
eventBus.on('selection.changed', event => {
  if (event.newSelection[0]?.id !== selected?.id) keepDocumentDraft = null;
  updateProperties(event.newSelection[0] || null);window.NaraStylePanel?.refresh();
});
eventBus.on('nara.properties', () => showDetail());
function StageSplitHandler(modeling,elementFactory,bpmnFactory,canvas,elementRegistry){
  this.preExecute=context=>{const source=elementRegistry.get(context.sourceId);if(!source||!isStage(source)||![2,3].includes(context.count)||source.width/context.count<80)throw Error('La etapa necesita al menos 80 px por columna.');
    const width=source.width/context.count,x=source.x,y=source.y,height=source.height;modeling.resizeShape(source,{x,y,width,height},null,{naraStageSync:true});
    context.stages=[source];for(let i=1;i<context.count;i++){let n=1,prefix=window.NaraStagePrefix();while(elementRegistry.get(prefix+'Etapa_'+n))n++;const shape=elementFactory.createShape({type:'bpmn:Group',businessObject:bpmnFactory.create('bpmn:Group',{id:prefix+'Etapa_'+n}),width,height});context.stages.push(modeling.createShape(shape,{x:x+width*(i+.5),y:y+height/2},canvas.getRootElement()));}
  };this.execute=()=>[];this.revert=()=>[];
}
StageSplitHandler.$inject=['modeling','elementFactory','bpmnFactory','canvas','elementRegistry'];
modeler.get('commandStack').registerHandler('project.stage.split',StageSplitHandler);
eventBus.on('nara.stage.split',event=>{const context={sourceId:event.element.id,count:event.count};modeler.get('commandStack').execute('project.stage.split',context);modeler.get('selection').select(context.stages[0]);});
eventBus.on('commandStack.shape.resize.preExecute',1600,event=>{
  const c=event.context,s=c.shape;if(!isStage(s)||c.hints?.naraStageSync)return;
  const stages=modeler.get('elementRegistry').getAll().filter(e=>isStage(e)&&e!==s&&modeler.get('canvas').findRoot(e)===modeler.get('canvas').findRoot(s));
  const band=stages.filter(e=>Math.abs(e.y-s.y)<1&&Math.abs(e.height-s.height)<1),connected=new Set([s]),queue=[s];
  while(queue.length){const current=queue.pop();for(const peer of band)if(!connected.has(peer)&&(Math.abs(peer.x+peer.width-current.x)<1||Math.abs(peer.x-current.x-current.width)<1)){connected.add(peer);queue.push(peer);}}
  const same=[...connected].filter(e=>e!==s),left=same.find(e=>Math.abs(e.x+e.width-s.x)<1),right=same.find(e=>Math.abs(e.x-s.x-s.width)<1),b=c.newBounds;
  if((left&&left.width+b.x-s.x<80)||(right&&right.width-(b.x+b.width-s.x-s.width)<80))throw Error('Conserva al menos 80 px en cada etapa.');
  c.naraStagePeers={same,left,right,old:{x:s.x,y:s.y,width:s.width,height:s.height}};
});
eventBus.on('commandStack.shape.resize.postExecuted',event=>{
  const c=event.context,p=c.naraStagePeers;if(!p)return;const s=c.shape,modeling=modeler.get('modeling');
  for(const peer of p.same){let x=peer.x,width=peer.width;if(peer===p.left)width+=s.x-p.old.x;if(peer===p.right){const delta=s.x+s.width-p.old.x-p.old.width;x+=delta;width-=delta;}
    if(x!==peer.x||width!==peer.width||s.y!==p.old.y||s.height!==p.old.height)modeling.resizeShape(peer,{x,y:s.y,width,height:s.height},null,{naraStageSync:true});}
});
eventBus.on('nara.stage.insert', event => {
  const context = {sourceId:event.element.id,direction:event.direction};
  modeler.get('commandStack').execute('project.stage.add',context);
  modeler.get('selection').select(context.stage);
  status('Etapa añadida. Puedes cambiar su nombre con doble clic.');
});
eventBus.on('nara.openSubprocess', event => {
  try { modeler.get('naraSheets').openSubprocess(event.element.id); } catch (error) { status(error.message); }
});
eventBus.on('nara.sheet.changed', () => { renderStageNavigation(); updateProperties(null);updateFocusSheet();window.NaraStylePanel?.refresh(); });
eventBus.on('commandStack.shape.create.postExecuted', event => {
  const shape = event.context.shape;
  if (isStage(shape) && !stageName(shape)) modeler.get('modeling').updateLabel(shape, 'Nueva etapa', {x: shape.x + 10, y: shape.y + 8, width: shape.width - 20, height: 32});
});

function basePropertyDraftPending() {
  if (!selected || byId('propertyForm').hidden) return false;
  const bo = selected.businessObject;
  const name = selected.type === 'bpmn:Group' ? stageName(selected) : selected.type === 'bpmn:TextAnnotation' ? bo.text || '' : bo.name || '';
  return byId('elementName').value !== name || byId('elementDocumentation').value !== (bo.documentation || []).map(d => d.text || '').join('\n\n');
}
window.NaraPropertyDraftPending = () => Boolean(window.NaraER?.pending() || basePropertyDraftPending() || semanticProperties.pending() || window.NaraInstantEdit?.pending());
eventBus.on('commandStack.changed', () => {
  if (ready) { setDirty(true); editSequence += 1; }
  refreshActions(); window.NaraStylePanel?.refresh(); decorateStages(); decorateDocuments(); renderStageNavigation();
  queueMicrotask(() => {
    if (selected) {
      updateProperties(modeler.get('elementRegistry').get(selected.id) || null);
      if (keepDocumentDraft?.id === selected?.id) {
        byId('elementName').value = keepDocumentDraft.name;
        byId('elementDocumentation').value = keepDocumentDraft.description;
      }
    }
  });
});
eventBus.on('canvas.viewbox.changed', event => {
  if(window.NaraER?.active())return;
  const value = Math.round(event.viewbox.scale * 100); byId('zoomValue').textContent = value + ' %'; byId('zoomRange').value = String(value);
});
eventBus.on('nara.erd.zoom',event=>{const value=Math.round(event.scale*100);byId('zoomValue').textContent=value+' %';byId('zoomRange').value=String(value);});
document.addEventListener('keydown', event => {
  if(window.NaraMicrosoftOperation)return;
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 's') { event.preventDefault(); saveBpmn().catch(error => status(error.message)); return; }
  if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.key.toLowerCase() === 'z') { event.preventDefault(); modeler.get('commandStack')[event.shiftKey ? 'redo' : 'undo'](); }
  if (event.key.toLowerCase() === 'y') { event.preventDefault(); modeler.get('commandStack').redo(); }
});
window.addEventListener('beforeunload', event => { if (!window.NaraMicrosoftRedirect && (dirty||window.NaraPropertyDraftPending?.())) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('resize', () => modeler.get('canvas').resized());
window.addEventListener('focus', () => pollFile());
document.addEventListener('visibilitychange', () => {if(document.visibilityState==='visible')pollFile();});
let autoSavePointer=false;
window.naraAutoSave=new window.NaraAutoSave({
  state:()=>({target:browserFiles.readOnly?null:(standalone||detached)?browserFiles.handle:activeDiagram,document:browserDocumentVersion,dirty,saving,uncertain:!!browserFiles.handle&&(browserFiles.uncertain===browserFiles.handle||!!browserFiles.handle.uncertain),pending:Boolean(window.NaraPropertyDraftPending?.()||autoSavePointer||modeler.get('directEditing').isActive()),busy:!ready||loadingDiagram||filePolling||Boolean(window.NaraMicrosoftDialogOpen)}),
  save:()=>saveBpmn(true),
  render:(kind,message,detail)=>{byId('dirtyState').textContent=browserFiles.readOnly?'Solo consulta':message;byId('dirtyState').dataset.saveState=browserFiles.readOnly?'readonly':kind;byId('dirtyState').title=detail||'El guardado automático conserva los cambios aplicados en el archivo elegido.';}
});
byId('autoSaveEnabled').onchange=event=>window.naraAutoSave.enable(event.target.checked);
window.addEventListener('online',()=>window.naraAutoSave.retrySafe());
for(const event of ['input','change','focusout'])document.addEventListener(event,()=>window.naraAutoSave.refresh(),true);
window.addEventListener('pointerdown',()=>{autoSavePointer=true;},true);
for(const event of ['pointerup','pointercancel','blur'])window.addEventListener(event,()=>{autoSavePointer=false;window.naraAutoSave.refresh();},true);
window.NaraStartup = bootstrap().catch(error => { window.diagramError = error.message; status('No se pudo preparar el editor: '+error.message);throw error; }).finally(()=>{window.NaraStartupPending=false;window.naraAutoSave.refresh();});
// Microsoft observes this same promise; retain its rejected state without an unhandled rejection.
window.NaraStartup.catch(()=>{});
