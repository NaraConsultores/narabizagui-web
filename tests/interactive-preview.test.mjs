import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as audit from '../plugins/naraflows/shared/audit.mjs';
const source=await readFile(new URL('../editor-visual.js',import.meta.url),'utf8');
function fixture(){
 const root={id:'P'},bo={$parent:{id:'P'},$instanceOf:type=>type==='bpmn:Task'},a={id:'A',type:'bpmn:ManualTask',x:100,y:200,width:200,height:100,parent:root,businessObject:{...bo,name:'Texto genérico'}},b={id:'B',type:'bpmn:Task',x:600,y:200,width:100,height:80,parent:root,businessObject:{...bo}},flow={id:'F',type:'bpmn:SequenceFlow',source:a,target:b,businessObject:{...bo},parent:root,waypoints:[{x:300,y:250},{x:450,y:250},{x:450,y:160},{x:650,y:160},{x:650,y:200}]};
 const listeners=new Map(),events={on(types,priority,fn){if(typeof priority==='function')fn=priority,priority=1000;for(const type of Array.isArray(types)?types:[types]){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({priority,fn});}},fire(type,data){for(const h of (listeners.get(type)||[]).sort((a,b)=>b.priority-a.priority))h.fn({...data,type});}},registry={getAll:()=>[a,b,flow],get:id=>[a,b,flow].find(e=>e.id===id),getGraphics:()=>({querySelector:()=>null})},canvas={findRoot:()=>root,getRootElement:()=>root,zoom:()=>1,getAbsoluteBBox:e=>({...e}),addMarker(){},removeMarker(){}},draws=[],preview={drawPreview:(c,allowed,hints)=>draws.push({allowed,hints})},commands=new Map(),stack={registerHandler:(name,handler)=>commands.set(name,handler)},modeling={updateProperties:(e,props)=>Object.assign(e.businessObject,props)},labelEditor={getEditingBBox:()=>({bounds:{},style:{}})};
 const elements=[a,b,flow];registry.getAll=()=>elements;registry.get=id=>elements.find(e=>e.id===id);
 const services={canvas,elementRegistry:registry,modeling,commandStack:stack,eventBus:events,connectionPreview:preview,moddle:{create:(type,props)=>({$type:type,...props})},labelEditingProvider:labelEditor,textRenderer:{getDefaultStyle:()=>({lineHeight:1.2,fontSize:12})},rules:{allowed:(action,{source,target})=>source&&target&&source!==target?{type:'bpmn:SequenceFlow'}:false},graphicsFactory:{update(){}}};
 const window={NaraModelAudit:audit,NaraERModel:{visualStyle:v=>v}};vm.runInNewContext(source,{window});const visual=window.NaraVisual.create({get:name=>services[name]});return{a,b,flow,root,preview,draws,events,visual,labelEditor,elements};
}
test('a free endpoint preview stays orthogonal and neutral without making an empty target valid',()=>{
 const f=fixture(),before=JSON.stringify(f.flow.waypoints),context={connection:f.flow,type:'reconnectEnd',hover:f.root,allowed:false};
 f.preview.drawPreview(context,false,{source:f.a,target:f.b,connectionEnd:{x:580,y:180}});const result=f.draws.at(-1);
 assert.ok(audit.routeMetrics(result.hints.waypoints).orthogonal);assert.equal(result.hints.noLayout,true);assert.equal(result.hints.noCropping,true);assert.equal(context.allowed,false);assert.equal(JSON.stringify(f.flow.waypoints),before);
});
test('a genuinely incompatible target does not get a successful preview',()=>{
 const f=fixture();f.preview.drawPreview({connection:f.flow,type:'reconnectEnd',hover:f.a},false,{source:f.a,target:f.a,connectionEnd:{x:200,y:200}});assert.equal(f.draws.at(-1).allowed,false);
});
test('endpoint proximity chooses a compatible shape at screen distance and Alt disables it',()=>{
 const f=fixture(),c={connection:f.flow,type:'reconnectEnd',hover:f.root,allowed:false};f.events.fire('bendpoint.move.move',{context:c,x:650,y:187,originalEvent:{}});assert.equal(c.hover,f.b);assert.equal(c.target,f.b);assert.ok(c.allowed);
 f.events.fire('bendpoint.move.move',{context:c,x:650,y:187,originalEvent:{altKey:true}});assert.equal(c.allowed,false);assert.equal(c.naraNearby,null);
});
test('internal bendpoint preview is also the geometry consumed by the native update command',()=>{
 const f=fixture(),c={connection:f.flow,type:'updateWaypoints'},points=[{x:300,y:250},{x:470,y:230},{x:470,y:160},{x:650,y:200}];
 f.preview.drawPreview(c,true,{noLayout:true,waypoints:points});const rendered=JSON.stringify(f.draws.at(-1).hints.waypoints);f.events.fire('bendpoint.move.end',{context:c});const command={connection:f.flow,newWaypoints:points,hints:{bendpointMove:{}}};f.events.fire('commandStack.connection.updateWaypoints.preExecute',{context:command});assert.equal(JSON.stringify(command.newWaypoints),rendered);assert.ok(audit.routeMetrics(command.newWaypoints).orthogonal);
});
test('task editor uses the same font, content width and icon margin as the SVG',()=>{
 const f=fixture(),editing=f.labelEditor.getEditingBBox(f.a);assert.equal(editing.bounds.x,130);assert.equal(editing.bounds.width,160);assert.equal(editing.bounds.y,208);assert.equal(editing.bounds.height,82);assert.equal(editing.style.fontSize,'16px');assert.equal(editing.style.paddingLeft,0);assert.equal(editing.style.lineHeight,1.2);
});
test('moving the shared endpoint detaches its old trunk and commits the exact preview route',()=>{
 const f=fixture(),reference={...f.flow,id:'R',businessObject:{...f.flow.businessObject}};f.elements.push(reference);
 f.flow.businessObject.extensionElements={values:[{$type:'nara:ConnectionRouting',json:JSON.stringify({mode:'orthogonal',manual:true,source:{side:'right',offset:.5},target:{side:'top',offset:.5},sharedWith:'R',sharedEnd:'target',joinPoint:{x:500,y:160}})}]};
 const point={x:600,y:232},ctx={connection:f.flow,type:'reconnectEnd',hover:f.b};f.preview.drawPreview(ctx,{type:f.flow.type},{source:f.a,target:f.b,connectionEnd:point});const shown=f.draws.at(-1).hints.waypoints;
 const command={connection:f.flow,newTarget:f.b,dockingOrPoints:point,hints:{docking:'target'}};f.events.fire('commandStack.connection.reconnect.preExecute',{context:command});assert.equal(JSON.stringify(command.naraReconnectPlan.waypoints),JSON.stringify(shown));assert.equal(command.naraReconnectPlan.routing.sharedWith,undefined);assert.equal(command.naraReconnectPlan.routing.target.side,'left');
 f.events.fire('commandStack.connection.reconnect.postExecute',{context:command});assert.equal(f.visual.readRouting(f.flow).sharedWith,undefined);
});
