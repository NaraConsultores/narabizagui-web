import test from 'node:test';
import assert from 'node:assert/strict';
import {planReconnectPreview,planMovedRoutes,shareConnectionPath,projectRoute} from '../plugins/naraflows/shared/connection-editing.mjs';
import {routeMetrics,routeOrthogonal} from '../plugins/naraflows/shared/routing.mjs';
import {validateSnapshot} from '../plugins/naraflows/shared/audit.mjs';
const a={id:'A',type:'bpmn:Task',x:50,y:200,width:100,height:80,flowScopeId:'P'},c={...a,id:'C',y:20},b={...a,id:'B',x:500};
const reference={id:'F',type:'bpmn:SequenceFlow',sourceId:'A',targetId:'B',flowScopeId:'P',waypoints:[{x:150,y:240},{x:300,y:240},{x:300,y:160},{x:550,y:160},{x:550,y:200}],routing:{mode:'orthogonal',source:{side:'right',offset:.5},target:{side:'top',offset:.5}}};
const candidate={...reference,id:'G',sourceId:'C',waypoints:[{x:150,y:60},{x:550,y:60},{x:550,y:200}]};
const snapshot=()=>({elements:structuredClone([a,b,c,reference,candidate])});
test('reconnect preview uses the same anchors and planner as release without mutating the model',()=>{
 const data=snapshot(),before=structuredClone(data),preview=planReconnectPreview(data,'F',{targetPoint:{x:560,y:200}});assert.deepEqual(data,before);
 const flow=data.elements.find(e=>e.id==='F');flow.routing=preview.routing;
 assert.deepEqual(preview.waypoints,routeOrthogonal(data,{elementId:'F'}).waypoints);assert.equal(preview.routing.target.side,'top');assert.equal(preview.waypoints.at(-1).x,560);
});
test('joining a tail preserves two semantic connections and the reference geometry',()=>{
 const data=snapshot(),before=structuredClone(data),result=shareConnectionPath(data,{elementId:'G',withConnectionId:'F',point:{x:350,y:163}});
 assert.ok(routeMetrics(result.waypoints).orthogonal);assert.deepEqual(result.waypoints.at(-1),reference.waypoints.at(-1));assert.equal(result.routing.sharedWith,'F');assert.deepEqual(result.routing.joinPoint,{x:350,y:160});assert.deepEqual(data,before);
 data.elements.find(e=>e.id==='G').waypoints=result.waypoints;data.elements.find(e=>e.id==='G').routing=result.routing;
 const issues=validateSnapshot(data).issues;assert.ok(!issues.some(i=>['DANGLING_FLOW','LINE_OVERLAP','UNINTENDED_CONTACT'].includes(i.code)),JSON.stringify(issues));
});
test('moving a reference source also plans its dependent shared branch without moving either branch endpoint',()=>{
 const data=snapshot(),g=data.elements.find(e=>e.id==='G');Object.assign(g,shareConnectionPath(data,{elementId:'G',withConnectionId:'F',point:{x:350,y:160}}));const before=structuredClone(data);
 const plans=planMovedRoutes(data,{elementIds:['A'],delta:{x:80,y:80}});assert.deepEqual(plans.map(p=>p.elementId).sort(),['F','G']);assert.equal(plans.find(p=>p.elementId==='G').routing.sharedWith,'F');assert.deepEqual(data,before);
});
test('sharing a head retains distinct destinations and the same source docking',()=>{
 const data=snapshot();const g=data.elements.find(e=>e.id==='G');g.sourceId='A';g.targetId='C';g.waypoints=[{x:150,y:240},{x:200,y:240},{x:200,y:60},{x:150,y:60}];
 const result=shareConnectionPath(data,{elementId:'G',withConnectionId:'F',point:{x:250,y:240},end:'source'});assert.ok(routeMetrics(result.waypoints).orthogonal);assert.deepEqual(result.waypoints[0],reference.waypoints[0]);assert.equal(result.routing.sharedEnd,'source');assert.equal(g.targetId,'C');
});
test('sharing cannot silently replace the destination or use a diagonal reference',()=>{
 const data=snapshot();data.elements.find(e=>e.id==='G').targetId='A';assert.throws(()=>shareConnectionPath(data,{elementId:'G',withConnectionId:'F',point:{x:350,y:160}}),{code:'SHARED_TARGET_REQUIRED'});
 data.elements.find(e=>e.id==='G').targetId='B';data.elements.find(e=>e.id==='F').waypoints=[{x:150,y:240},{x:550,y:200}];assert.throws(()=>shareConnectionPath(data,{elementId:'G',withConnectionId:'F',point:{x:350,y:160}}),{code:'SHARED_ROUTE_DIAGONAL'});
 assert.deepEqual(projectRoute([{x:0,y:0},{x:100,y:0}],{x:40,y:5}).point,{x:40,y:0});
});
test('manual reconnect preview preserves unaffected interior bends and repairs an illegal last leg',()=>{
 const data=snapshot(),f=data.elements.find(e=>e.id==='F');f.routing.manual=true;
 const same=planReconnectPreview(data,'F',{targetPoint:{x:560,y:200}});assert.ok(same.waypoints.some(p=>p.x===300&&p.y===160));assert.equal(same.waypoints.at(-1).x,560);
 const changed=planReconnectPreview(data,'F',{targetPoint:{x:600,y:240}});assert.ok(routeMetrics(changed.waypoints).orthogonal);assert.equal(changed.routing.target.side,'right');assert.deepEqual(data.elements.find(e=>e.id==='A'),a);
});
test('shared references cannot form cycles and a crossing outside the shared trunk still warns',()=>{
 const data=snapshot();data.elements.find(e=>e.id==='G').routing={...candidate.routing,sharedWith:'F',sharedEnd:'target',joinPoint:{x:350,y:160}};
 assert.throws(()=>shareConnectionPath(data,{elementId:'F',withConnectionId:'G',point:{x:350,y:160}}),{code:'SHARED_ROUTE_CYCLE'});
 const g=data.elements.find(e=>e.id==='G');g.waypoints=[{x:150,y:60},{x:320,y:60},{x:320,y:250},{x:280,y:250},{x:280,y:160},{x:550,y:160},{x:550,y:200}];
 assert.ok(validateSnapshot(data).issues.some(i=>i.code==='LINE_CROSSING'));
});
