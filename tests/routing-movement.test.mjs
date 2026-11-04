import test from 'node:test';
import assert from 'node:assert/strict';
import {routeOrthogonal,routeMetrics,anchorPolicy} from '../plugins/naraflows/shared/routing.mjs';
import {planMovedRoutes,planReconnectPreview} from '../plugins/naraflows/shared/connection-editing.mjs';
import {reviewVisualQuality} from '../plugins/naraflows/shared/quality.mjs';
const a={id:'A',type:'bpmn:Task',x:590,y:490,width:260,height:100},b={...a,id:'B',x:270};
const bad=[{x:850,y:540},{x:860,y:540},{x:850,y:540},{x:850,y:590},{x:590,y:590},{x:590,y:540},{x:530,y:540}];
const legacy={mode:'orthogonal',source:{side:'right',offset:.5},target:{side:'right',offset:.5}};
const f={id:'F',type:'bpmn:SequenceFlow',sourceId:'A',targetId:'B',waypoints:bad,routing:legacy};
test('anonymous reversed-row regression exposes the 440 px reversal and a feasible 60 px local alternative',()=>{
 const data={elements:[a,b,f]},before=structuredClone(data),quality=reviewVisualQuality(data);
 assert.equal(routeMetrics(bad).length,440);assert.equal(routeMetrics(bad).reversals,1);
 for(const code of ['ROUTE_REVERSAL','ROUTE_ON_FIGURE_BORDER','ROUTE_AVOIDABLE_DETOUR'])assert.ok(quality.issues.some(i=>i.code===code),code);
 const plan=routeOrthogonal(data,{elementId:'F',sourceSide:'auto',targetSide:'auto'});
 assert.deepEqual(plan.waypoints,[{x:590,y:540},{x:530,y:540}]);assert.equal(plan.metrics.length,60);assert.equal(plan.routing.source.side,'left');assert.equal(plan.routing.target.side,'right');assert.deepEqual(data,before);
});
test('fixed anchors still get no immediate reversals or travel along task borders',()=>{
 const plan=routeOrthogonal({elements:[a,b,f]},{elementId:'F'});
 assert.equal(plan.routing.source.side,'right');assert.equal(plan.routing.target.side,'right');assert.equal(plan.metrics.reversals,0);
 const issues=reviewVisualQuality({elements:[a,b,{...f,...plan}]}).issues;assert.ok(!issues.some(i=>['ROUTE_REVERSAL','ROUTE_ON_FIGURE_BORDER','ROUTE_THROUGH_ENDPOINT'].includes(i.code)));
 assert.equal(anchorPolicy(legacy,'source'),'fixed');
});
test('automatic routing swaps sides after a horizontal inversion and survives JSON reopening',()=>{
 const data={elements:[{...a,x:270},{...b,x:590},{...f,routing:undefined}]};
 const first=routeOrthogonal(data,{elementId:'F'});Object.assign(data.elements[2],first);data.elements[0].x=590;data.elements[1].x=270;
 const plan=routeOrthogonal(JSON.parse(JSON.stringify(data)),{elementId:'F'});
 assert.equal(first.routing.source.side,'right');assert.equal(plan.routing.source.side,'left');assert.equal(plan.metrics.length,60);assert.equal(anchorPolicy(plan.routing,'source'),'auto');
});
test('explicit per-end choices stay fixed until auto is explicitly selected',()=>{
 const data={elements:[{...a},{...b},{...f,routing:undefined}]},fixed=routeOrthogonal(data,{elementId:'F',sourceSide:'top'});Object.assign(data.elements[2],fixed);
 assert.equal(fixed.routing.anchorPolicy.source,'fixed');assert.equal(fixed.routing.anchorPolicy.target,'auto');
 data.elements[1].y+=220;const next=routeOrthogonal(data,{elementId:'F'});assert.equal(next.routing.source.side,'top');
 const released=routeOrthogonal(data,{elementId:'F',sourceSide:'auto'});assert.equal(released.routing.anchorPolicy.source,'auto');
});
test('an explicit reconnect locks only the selected end and retains the other automatic policy',()=>{
 const data={elements:[a,b,{...f,routing:undefined}]};Object.assign(data.elements[2],routeOrthogonal(data,{elementId:'F'}));
 const plan=planReconnectPreview(data,'F',{targetPoint:{x:400,y:590}});
 assert.equal(plan.routing.anchorPolicy.source,'auto');assert.equal(plan.routing.anchorPolicy.target,'fixed');assert.equal(plan.routing.target.side,'bottom');assert.deepEqual(plan.waypoints.at(-1),{x:400,y:590});
});
test('moving a group and a document label predicts the same automatic routes as final geometry',()=>{
 const doc={id:'Doc',type:'bpmn:DataObjectReference',x:950,y:600,width:36,height:50,labelBounds:{x:920,y:660,width:100,height:30}},g={...f,id:'G',sourceId:'B',targetId:'Doc',routing:undefined,waypoints:[{x:530,y:540},{x:968,y:540},{x:968,y:600}]};
 const data={elements:[a,b,doc,{...f,routing:undefined},g]};
 for(const e of data.elements.filter(e=>e.waypoints))Object.assign(e,routeOrthogonal(data,{elementId:e.id}));
 const ids=['B','Doc','Doc_label'],delta={x:80,y:180},before=structuredClone(data),preview=planMovedRoutes(data,{elementIds:ids,delta});
 const final=structuredClone(data);for(const e of final.elements){if(ids.includes(e.id)){e.x+=delta.x;e.y+=delta.y;if(e.labelBounds){e.labelBounds.x+=delta.x;e.labelBounds.y+=delta.y;}}}
 assert.deepEqual(preview,planMovedRoutes(final,{elementIds:ids}));assert.deepEqual(data,before);assert.ok(preview.every(p=>p.metrics.orthogonal&&!p.metrics.reversals));
});
test('movement preserves explicit manual interior bends even when relocation creates a conflict',()=>{
 const manual={...f,routing:{...legacy,manual:true},waypoints:[{x:850,y:540},{x:900,y:540},{x:900,y:650},{x:570,y:650},{x:570,y:540},{x:530,y:540}]},data={elements:[{...a,y:560},b,manual]};
 const plan=planReconnectPreview(data,'F');assert.equal(plan.routing.manual,true);assert.ok(plan.waypoints.some(p=>p.x===900&&p.y===650));assert.ok(plan.waypoints.some(p=>p.x===570&&p.y===650));
});
test('a necessary obstacle detour and an intentional loop do not trigger an automatic local replacement',()=>{
 const wall={id:'Wall',type:'bpmn:Task',x:545,y:420,width:30,height:240},data={elements:[a,b,wall,{...f,routing:undefined}]},plan=routeOrthogonal(data,{elementId:'F'});
 const quality=reviewVisualQuality({elements:[a,b,wall,{...f,...plan}]});assert.ok(!quality.issues.some(i=>i.code==='ROUTE_AVOIDABLE_DETOUR'));
 const loop={...f,sourceId:'A',targetId:'A',routing:{...legacy,manual:true}};assert.doesNotThrow(()=>reviewVisualQuality({elements:[a,loop]}));
});
