import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import vm from 'node:vm';
const source=await readFile(new URL('../mcp-editor.js',import.meta.url),'utf8');
const readinessSource=await readFile(new URL('../editor-readiness.js',import.meta.url),'utf8');
function fixture(){
 const callbacks=new Map(),root={id:'Process',type:'bpmn:Process',businessObject:{$type:'bpmn:Process',name:''}},task={id:'Task',type:'bpmn:Task',businessObject:{$type:'bpmn:Task',name:'Original'}};task.parent=root;
 const counts={serialized:0,digested:0,fit:0,edits:0};
 const context={ready:true,loadingDiagram:false,saving:false,filePolling:false,dirty:false,setTimeout,crypto:{randomUUID},stageName:()=>'',roleFor:()=>'',phaseFor:()=>'',keepDocumentDraft:null,status(){},fit(){counts.fit++;},window:{NaraPropertyDraftPending:()=>false},browserFiles:{name:'Generic.bpmn',handle:null,async digest(xml){counts.digested++;return createHash('sha256').update(xml).digest('hex');}}};
 const services={eventBus:{on:(key,fn)=>callbacks.set(key,fn)},commandStack:{registerHandler(){},canUndo:()=>false,canRedo:()=>false},elementRegistry:{get:id=>id==='Task'?task:root,getAll:()=>[root,task]},canvas:{getRootElement:()=>root,findRoot:e=>e.parent||e},naraSheets:{list:()=>[{id:'Process',name:'Generic'}]},selection:{get:()=>[],select(){}},modeling:{updateLabel(e,text){e.businessObject.name=text;counts.edits++;context.dirty=true;callbacks.get('commandStack.changed')();}}};
 context.modeler={get:key=>services[key],async saveXML(){counts.serialized++;return{xml:'<model name="'+task.businessObject.name+'"/>'};}};
 vm.runInNewContext(readinessSource,context);vm.runInNewContext(source,context);return{context,editor:context.window.NaraFlowsEditor,counts,task,services};
}
test('reads remain available during autosave and unchanged revisions serialize only once',async()=>{
 const f=fixture();f.context.saving=true;
 const first=await f.editor.read(),second=await f.editor.read({detail:'summary'});
 assert.equal(first.autoSave.running,true);assert.equal(first.readiness.canEdit,false);assert.equal(first.readiness.busyReason,'saving');
 assert.equal(second.revision,first.revision);assert.equal(second.elementsOmitted,true);assert.equal('elements'in second,false);assert.equal(second.totalElements,2);
 assert.equal(f.counts.serialized,1);assert.equal(f.counts.digested,1);
});
test('lane routing capabilities disclose a missing analysis module without breaking document reads',async()=>{
 const f=fixture(),without=await f.editor.read();assert.equal(without.capabilities.laneBorderRouting,false);assert.equal(without.capabilities.laneBorderClearance,null);
 f.context.window.NaraModelAudit={LANE_BORDER_CLEARANCE:16,laneRouteConflicts(){}};
 const loaded=await f.editor.read();assert.equal(loaded.capabilities.laneBorderRouting,true);assert.equal(loaded.capabilities.laneBorderClearance,16);assert.equal(loaded.revision,without.revision);assert.equal(f.counts.serialized,1);
});
test('an edit waits for autosave, applies once and invalidates the cached serialization',async()=>{
 const f=fixture(),before=await f.editor.read();f.context.saving=true;setTimeout(()=>{f.context.saving=false;},10);
 const result=await f.editor.edit({expectedRevision:before.revision,operation:{type:'label',elementId:'Task',text:'Updated'}});
 assert.equal(result.applied,true);assert.equal(f.task.businessObject.name,'Updated');assert.equal(f.counts.edits,1);assert.equal(f.counts.serialized,2);
});
test('waiting for autosave never authorizes overwriting a newer manual revision',async()=>{
 const f=fixture(),before=await f.editor.read();f.context.saving=true;
 setTimeout(()=>{f.services.modeling.updateLabel(f.task,'Manual');f.context.saving=false;},10);
 await assert.rejects(f.editor.edit({expectedRevision:before.revision,operation:{type:'label',elementId:'Task',text:'Stale'}}),{code:'REVISION_CONFLICT'});
 assert.equal(f.task.businessObject.name,'Manual');assert.equal(f.counts.edits,1);
});
test('fit is a view operation and does not change revision, content or dirty state',async()=>{
 const f=fixture(),before=await f.editor.read();const result=await f.editor.edit({expectedRevision:before.revision,operation:{type:'fit'}});
 assert.equal(result.viewOnly,true);assert.equal(result.revision,before.revision);assert.equal(result.sha256,before.sha256);assert.equal(result.dirty,false);assert.equal(f.counts.fit,1);assert.equal(f.counts.edits,0);
});
test('a pending property draft is rejected without silently applying it',async()=>{
 const f=fixture(),before=await f.editor.read();f.context.window.NaraPropertyDraftPending=()=>true;
 await assert.rejects(f.editor.edit({expectedRevision:before.revision,operation:{type:'label',elementId:'Task',text:'Overwrite'}}),{code:'FORM_PENDING'});assert.equal(f.counts.edits,0);
});

test('Microsoft open rollback restores the prior XML, destination and dirty state after attach fails',async()=>{
 const f=fixture(),c=f.context,previousXml='<generic original="true"/>',sourceXml='<generic remote="true"/>',oldHandle={name:'Previous.bpmn'};let xml=previousXml;
 c.modeler.saveXML=async()=>({xml});c.openDiagram=async next=>{xml=next;};c.browserDocumentVersion=1;c.browserFileContext=()=>{};c.setDirty=value=>{c.dirty=value;};c.browserFiles.handle=oldHandle;c.browserFiles.name='Previous.bpmn';c.browserFiles.hash='previous-hash';c.browserFiles.baseXml=previousXml;c.browserFiles.attach=async()=>{throw Error('Injected attach failure');};c.dirty=true;
 f.services.canvas.viewbox=()=>({x:0,y:0,width:100,height:100});f.services.naraSheets.open=()=>{};
 const check=()=>{};check.identity=()=>{};
 await assert.rejects(f.editor.fileAdapter.open({xml:sourceXml,name:'Remote.bpmn'},check,true),/Injected attach failure/);
 assert.equal(xml,previousXml);assert.equal(c.browserFiles.handle,oldHandle);assert.equal(c.browserFiles.hash,'previous-hash');assert.equal(c.dirty,true);assert.equal(c.window.NaraMicrosoftRecovery,undefined);assert.equal(c.loadingDiagram,false);
});
test('an unverified Microsoft rollback keeps its recovery snapshot and blocks mutations',async()=>{
 const f=fixture(),c=f.context;c.browserDocumentVersion=1;c.openDiagram=async()=>{throw Error('Injected import failure');};f.services.canvas.viewbox=()=>({x:0,y:0,width:100,height:100});const check=()=>{};check.identity=()=>{};
 await assert.rejects(f.editor.fileAdapter.open({xml:'<generic/>',name:'Remote.bpmn'},check,true),{code:'RECOVERY_REQUIRED'});
 assert.ok(c.window.NaraMicrosoftRecovery.xml);const state=await f.editor.read();await assert.rejects(f.editor.edit({expectedRevision:state.revision,operation:{type:'label',elementId:'Task',text:'Blocked'}}),{code:'RECOVERY_REQUIRED'});
});

test('a failed initialization returns a terminal diagnostic without serializing or pretending to be ready',async()=>{
 const f=fixture();f.context.ready=false;f.context.window.diagramError='Import failed';
 const status=await f.editor.read({detail:'summary',waitForReadyMs:5000});
 assert.equal(status.documentReady,false);assert.equal(status.readiness.busyReason,'initialization_failed');assert.equal(status.readiness.retryable,false);assert.equal(status.readiness.message,'Import failed');assert.equal(f.counts.serialized,0);
 await assert.rejects(f.editor.read(),{code:'EDITOR_INITIALIZATION_FAILED'});
});
test('a readiness read waits for Microsoft restoration before returning the document revision',async()=>{
 const f=fixture();let restoring=true;f.context.window.NaraMicrosoftUI={restoring:()=>restoring};
 const pending=f.editor.read({detail:'summary',waitForReadyMs:1000});
 setTimeout(()=>{f.services.modeling.updateLabel(f.task,'Restored document');restoring=false;},10);
 const after=await pending;assert.equal(after.documentReady,true);assert.equal(after.readiness.canEdit,true);assert.equal(f.counts.serialized,1);
 assert.equal(after.sha256,(await f.editor.read()).sha256);
});
test('a timed-out startup reports its reason and does not serialize an unstable document',async()=>{
 const f=fixture();f.context.window.NaraStartupPending=true;
 const status=await f.editor.read({detail:'summary',waitForReadyMs:10});
 assert.equal(status.documentReady,false);assert.equal(status.readiness.busyReason,'initializing');assert.equal(status.readiness.recovery,'wait_once');assert.equal(f.counts.serialized,0);
});

test('a preparation summary waits out autosave so the next call can edit directly',async()=>{
 const f=fixture();f.context.saving=true;setTimeout(()=>{f.context.saving=false;},10);
 const result=await f.editor.read({detail:'summary',waitForReadyMs:1000});assert.equal(result.readiness.canEdit,true);assert.equal(f.counts.serialized,1);
});

test('Microsoft operations retain the opaque document identity and the read-only tab guard',async()=>{
 const f=fixture(),c=f.context;c.browserFiles.documentId='microsoft:opaque-file-identity';
 const state=await f.editor.read();assert.equal(state.documentId,'microsoft:opaque-file-identity');
 assert.equal(f.editor.fileAdapter.state().documentId,state.documentId);
 assert.equal(state.capabilities.documentGuard,true);assert.equal(state.capabilities.adaptiveRouting,true);
 c.browserFiles.readOnly=true;
 await assert.rejects(f.editor.fileAdapter.prepare(state.revision),{code:'FILE_READ_ONLY'});
 assert.equal(c.browserFiles.documentId,state.documentId);assert.equal(f.counts.edits,0);
});

test('a partially attached Microsoft open reacquires the previous document identity on rollback',async()=>{
 const f=fixture(),c=f.context,previousXml='<generic original="true"/>',remoteXml='<generic remote="true"/>',oldHandle={name:'Previous.bpmn'},remoteHandle={name:'Remote.bpmn'};let xml=previousXml,attaches=0;
 c.modeler.saveXML=async()=>({xml});c.openDiagram=async next=>{xml=next;};c.browserDocumentVersion=1;c.browserFileContext=()=>{};c.setDirty=value=>{c.dirty=value;};
 Object.assign(c.browserFiles,{handle:oldHandle,name:'Previous.bpmn',documentId:'local:original',hash:'previous-hash',baseXml:previousXml});
 c.browserFiles.attach=async source=>{attaches++;c.browserFiles.handle=source.handle;c.browserFiles.documentId=source.handle===oldHandle?'local:original':'microsoft:remote';if(source.handle===remoteHandle)throw Error('Failure after changing file ownership');};
 f.services.canvas.viewbox=()=>({x:0,y:0,width:100,height:100});f.services.naraSheets.open=()=>{};
 const check=()=>{};check.identity=()=>{};
 await assert.rejects(f.editor.fileAdapter.open({xml:remoteXml,handle:remoteHandle,name:'Remote.bpmn'},check,true),/Failure after changing file ownership/);
 assert.equal(attaches,2);assert.equal(xml,previousXml);assert.equal(c.browserFiles.handle,oldHandle);assert.equal(c.browserFiles.documentId,'local:original');assert.equal(c.window.NaraMicrosoftRecovery,undefined);
});
