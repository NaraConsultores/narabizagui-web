import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {build} from 'esbuild';
import * as audit from '../plugins/naraflows/shared/audit.mjs';

const bundle=await build({stdin:{contents:`
 export {BpmnModdle} from 'bpmn-moddle'; export {Ids} from 'ids';
 export {default as BpmnFactory} from 'bpmn-js/lib/features/modeling/BpmnFactory.js';
 export {default as UpdateProperties} from 'bpmn-js/lib/features/modeling/cmd/UpdatePropertiesHandler.js';
 export {default as UpdateModdle} from 'bpmn-js/lib/features/modeling/cmd/UpdateModdlePropertiesHandler.js';
 export {default as EventBus} from 'diagram-js/lib/core/EventBus.js'; export {default as CommandStack} from 'diagram-js/lib/command/CommandStack.js';
`,resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,platform:'node',format:'cjs',write:false});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {BpmnModdle,Ids,BpmnFactory,UpdateProperties,UpdateModdle,EventBus,CommandStack}=module.exports;
const sources=await Promise.all(['editor-readiness.js','editor-properties.js','editor-operations.js','editor-blocks.js'].map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')));
const xml=`<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs" targetNamespace="https://example.test"><bpmn:process id="Process"><bpmn:task id="Task" name="Original"/></bpmn:process></bpmn:definitions>`;

async function fixture(sourceXml=xml,options={}){
 let counter=0;
 class Headless {
  async importXML(source){
   this.moddle=new BpmnModdle();this.moddle.ids=new Ids([32,36,1]);const parsed=await this.moddle.fromXML(source);this.defs=parsed.rootElement;
   const registry=new Map(),visit=(bo,parent)=>{const shape={id:bo.id,type:bo.$type,businessObject:bo,parent};registry.set(bo.id,shape);for(const child of bo.flowElements||[])visit(child,shape);return shape;};this.root=visit(this.defs.rootElements[0]);
   const elementRegistry={get:id=>registry.get(id),getAll:()=>[...registry.values()],filter:fn=>[...registry.values()].filter(fn)};
   const eventBus=new EventBus(),services={elementRegistry,moddle:this.moddle,eventBus,bpmnFactory:new BpmnFactory(this.moddle),textRenderer:{},canvas:{getRootElement:()=>this.root,findRoot:e=>{while(e.parent)e=e.parent;return e;}}};
   const stack=services.commandStack=new CommandStack(eventBus,{instantiate:Type=>new Type(...(Type.$inject||[]).map(key=>services[key]))});
   services.modeling={updateProperties:(element,properties)=>stack.execute('element.updateProperties',{element,properties}),updateModdleProperties:(element,moddleElement,properties)=>stack.execute('element.updateModdleProperties',{element,moddleElement,properties})};
   stack.registerHandler('element.updateProperties',UpdateProperties);stack.registerHandler('element.updateModdleProperties',UpdateModdle);
   this.services=services;this.revision='r'+counter++;eventBus.on('commandStack.changed',()=>this.revision='r'+counter++);return{warnings:parsed.warnings};
  }
  get(key){return this.services[key];}getDefinitions(){return this.defs;}destroy(){}
  async saveXML(){return this.moddle.toXML(this.defs,{format:true});}
 }
 const modeler=new Headless();await modeler.importXML(sourceXml);
 const context={window:{NaraModelAudit:audit},BpmnJS:Headless,document:{createElement:()=>({style:{},remove(){}}),body:{appendChild(){}}}};
 for(const source of sources)vm.runInNewContext(source,context);
 const semantic=context.window.NaraBpmnProperties.create(modeler);
 const describe=(e,target=modeler)=>({id:e.id,type:e.type,name:e.businessObject.name||'',eventDefinitions:(e.businessObject.eventDefinitions||[]).map(d=>({type:d.$type})),documentation:(e.businessObject.documentation||[]).map(d=>d.text).join('\n\n'),semanticProperties:Object.fromEntries(context.window.NaraBpmnProperties.create(target).describe(e).fields.map(f=>[f.key,f.value]))});
 const read=async()=>{const {xml}=await modeler.saveXML();return{revision:modeler.revision,sha256:createHash('sha256').update(xml).digest('hex'),xml,diagramType:'bpmn',elements:modeler.get('elementRegistry').getAll().map(e=>describe(e)),warnings:[]};};
 const guard=expected=>{if(expected!==modeler.revision)throw Object.assign(Error('revision'),{code:'REVISION_CONFLICT'});};
 const blocks=context.window.NaraMcpBlocks.create({modeler,read,guard,describe,getRevision:()=>modeler.revision,...options});
 return{modeler,read,blocks,semantic,task:modeler.get('elementRegistry').get('Task')};
}
const changes=[{type:'documentation',elementId:'Task',text:'Description'},{type:'properties',elementId:'Task',values:{loopMode:'sequential',loopCardinality:'3'}}];

test('compact responses preserve revision, aliases and validation while omitting the model payload',async()=>{
 const f=await fixture(),before=await f.read(),input={expectedRevision:before.revision,requestId:'compact',operations:changes};
 const result=await f.blocks.batch({...input,response:'summary'});
 assert.equal(result.applied,true);assert.equal(result.state.elementsOmitted,true);assert.equal('elements'in result.state,false);assert.equal('xml'in result.state,false);assert.ok(result.validation);
 const replay=await f.blocks.batch({...input,response:'full'});assert.equal(replay.replayed,true);assert.equal(replay.state.sha256,result.state.sha256);assert.ok(replay.state.elements.length);assert.ok(JSON.stringify(result).length<JSON.stringify(replay).length);
});
test('presentation happens once after a valid commit, never in dry-run, and the block still undoes once',async()=>{
 let calls=0,options;const f=await fixture(xml,{present:async value=>{calls++;options=value;assert.equal(f.task.businessObject.documentation[0].text,'Description');return{paintConfirmed:true};}}),before=await f.read();
 const input={expectedRevision:before.revision,requestId:'presentation',operations:changes,fit:true,presentation:{expandedCanvas:true}};
 await f.blocks.batch({...input,dryRun:true});assert.equal(calls,0);
 const result=await f.blocks.batch(input);assert.equal(calls,1);assert.equal(options.expandedCanvas,true);assert.equal(options.fit,true);assert.ok(result.timings.firstVisibleMs>=0);assert.ok(result.timings.totalMs>=result.timings.firstVisibleMs);
 await f.blocks.batch(input);assert.equal(calls,1);f.modeler.get('commandStack').undo();assert.equal((await f.read()).sha256,before.sha256);
});
test('manual changes during presentation are preserved and explicitly require reconciliation',async()=>{
 const f=await fixture(xml,{present:async()=>{f.modeler.get('modeling').updateProperties(f.task,{name:'Manual during presentation'});return{paintConfirmed:true};}}),before=await f.read();
 const result=await f.blocks.batch({expectedRevision:before.revision,requestId:'concurrent-presentation',operations:[changes[0]]});
 assert.equal(result.applied,true);assert.equal(result.reconciliationRequired,true);assert.notEqual(result.committedRevision,result.state.revision);assert.equal(f.task.businessObject.name,'Manual during presentation');
});

test('dry run does not alter XML/history; applied properties and documentation undo/redo once',async()=>{
 const f=await fixture(),before=await f.read();
 const input={expectedRevision:before.revision,requestId:'batch1',operations:changes};
 assert.equal((await f.blocks.batch({...input,dryRun:true})).dryRun,true);assert.equal((await f.read()).sha256,before.sha256);assert.equal(f.modeler.get('commandStack').canUndo(),false);
 const result=await f.blocks.batch(input);assert.equal(result.applied,true);assert.equal(f.task.businessObject.loopCharacteristics.loopCardinality.body,'3');
 f.modeler.get('commandStack').undo();assert.equal((await f.read()).sha256,before.sha256);
 f.modeler.get('commandStack').redo();assert.equal((await f.read()).sha256,result.state.sha256);
});
test('a later invalid operation fails prevalidation without partially modifying the original',async()=>{
 const f=await fixture(),before=await f.read();
 await assert.rejects(f.blocks.batch({expectedRevision:before.revision,requestId:'invalid',operations:[changes[0],{type:'properties',elementId:'Task',values:{linkName:'wrong'}}]}),/Propiedad no admitida/);
 assert.equal((await f.read()).sha256,before.sha256);assert.equal(f.modeler.get('commandStack').canUndo(),false);
});

test('requireValid rejects an audit error without changing XML or history',async()=>{
 const f=await fixture(xml.replace('<bpmn:task','<bpmn:startEvent id="Timer"><bpmn:timerEventDefinition/></bpmn:startEvent><bpmn:task')),before=await f.read();
 const result=await f.blocks.batch({expectedRevision:before.revision,requestId:'invalid-audit',requireValid:true,operations:changes});
 assert.ok(result.validation.issues.some(issue=>issue.code==='TIMER_VALUE_MISSING'));
 assert.equal(result.applied,false);assert.equal(result.code,'BATCH_VALIDATION_FAILED');
 assert.equal((await f.read()).sha256,before.sha256);assert.equal(f.modeler.get('commandStack').canUndo(),false);
 assert.ok(Array.isArray(result.previewElements));
});

test('a complex block exceeding the former 50-operation limit remains one reversible change',async()=>{
 const f=await fixture(),before=await f.read();
 const operations=Array.from({length:75},(_,index)=>({type:'documentation',elementId:'Task',text:'Step '+index}));
 const result=await f.blocks.batch({expectedRevision:before.revision,requestId:'large',operations});
 assert.equal(result.applied,true);assert.equal(result.operationCount,75);assert.equal(f.task.businessObject.documentation[0].text,'Step 74');
 f.modeler.get('commandStack').undo();assert.equal((await f.read()).sha256,before.sha256);
 await assert.rejects(f.blocks.batch({expectedRevision:(await f.read()).revision,requestId:'oversized',operations:Array.from({length:201},()=>operations[0])}),{code:'INVALID_BATCH'});
});
test('confirmed replay is idempotent and cannot be rebound to another operation',async()=>{
 const f=await fixture(),before=await f.read(),input={expectedRevision:before.revision,requestId:'repeat',operations:changes};
 const first=await f.blocks.batch(input),second=await f.blocks.batch(input);assert.equal(second.replayed,true);assert.equal(second.state.sha256,first.state.sha256);
 await assert.rejects(f.blocks.batch({...input,operations:[changes[0]]}),/identificador ya pertenece/);
});
test('unexpected native failure rolls back XML and restores pre-existing redo history',async()=>{
 const f=await fixture(),stack=f.modeler.get('commandStack'),modeling=f.modeler.get('modeling');
 modeling.updateProperties(f.task,{name:'History'});stack.undo();const before=await f.read();assert.equal(stack.canRedo(),true);
 const original=modeling.updateProperties;let calls=0;
 modeling.updateProperties=(...args)=>{if(++calls===2)throw Error('Injected runtime failure');return original(...args);};
 const result=await f.blocks.batch({expectedRevision:before.revision,requestId:'rollback',operations:[changes[0],{type:'documentation',elementId:'Task',text:'Second'}]});
 assert.equal(result.rolledBack,true);assert.equal(result.applied,false);assert.equal((await f.read()).sha256,before.sha256);assert.equal(stack.canRedo(),true);
 modeling.updateProperties=original;stack.redo();assert.equal(f.task.businessObject.name,'History');
});
test('a manual edit after commit is preserved when the confirmation read conflicts',async()=>{
 const f=await fixture(),before=await f.read();let injected=false;
 const real=f.modeler.saveXML.bind(f.modeler);f.modeler.saveXML=async()=>{const result=await real();if(!injected&&f.task.businessObject.documentation?.[0]?.text==='Description'){injected=true;f.modeler.get('modeling').updateProperties(f.task,{name:'Manual edit'});throw Error('Concurrent revision');}return result;};
 const result=await f.blocks.batch({expectedRevision:before.revision,requestId:'manual',operations:[changes[0]]});
 assert.equal(result.applied,true);assert.equal(result.reconciliationRequired,true);assert.equal(f.task.businessObject.name,'Manual edit');assert.equal(f.task.businessObject.documentation[0].text,'Description');
});
