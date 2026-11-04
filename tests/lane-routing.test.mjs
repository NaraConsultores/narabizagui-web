import test from 'node:test';
import assert from 'node:assert/strict';
import {laneBoundaries,laneRouteConflicts,LANE_BORDER_CLEARANCE} from '../plugins/naraflows/shared/lane-routing.mjs';
import {routeOrthogonal} from '../plugins/naraflows/shared/routing.mjs';
import {planMovedRoutes,planReconnectPreview} from '../plugins/naraflows/shared/connection-editing.mjs';
import {reviewVisualQuality} from '../plugins/naraflows/shared/quality.mjs';
function parallelSplit(){
 const pool={id:'Pool',type:'bpmn:Participant',x:0,y:0,width:1100,height:800},upper={id:'Upper',type:'bpmn:Lane',parentId:'Pool',x:30,y:0,width:1070,height:400},lower={...upper,id:'Lower',y:400};
 const gate={id:'Split',type:'bpmn:ParallelGateway',parentId:'Upper',x:200,y:250,width:50,height:50},a={id:'A',type:'bpmn:Task',parentId:'Lower',x:500,y:500,width:100,height:80},b={...a,id:'B',x:800},obstacle={id:'Other',type:'bpmn:Task',parentId:'Upper',x:350,y:200,width:100,height:190};
 const f={id:'F',type:'bpmn:SequenceFlow',sourceId:'Split',targetId:'A'},g={...f,id:'G',targetId:'B'};
 const data={elements:[pool,upper,lower,gate,a,b,obstacle,f,g]};Object.assign(f,routeOrthogonal(data,{elementId:'F',sourceSide:'bottom',targetSide:'top'}));return data;
}
test('parallel split keeps both fixed docks and uses an interior corridor instead of the shared lane edge',()=>{
 const data=parallelSplit(),before=structuredClone(data),result=routeOrthogonal(data,{elementId:'G',sourceSide:'bottom',targetSide:'top'}),borders=laneBoundaries(data);
 assert.deepEqual(borders,[{axis:'y',value:400,from:30,to:1100,laneIds:['Upper','Lower'],parentId:'Pool'}]);
 assert.deepEqual(result.waypoints,[{x:225,y:300},{x:225,y:310},{x:340,y:310},{x:340,y:416},{x:850,y:416},{x:850,y:500}]);
 assert.equal(laneRouteConflicts(result.waypoints,borders).length,0);assert.equal(result.routing.source.side,'bottom');assert.equal(result.routing.target.side,'top');assert.deepEqual(data,before);
});
test('upper task to a displaced lower task: manual border route is diagnosed read-only, and a local repair retains its sides',()=>{
 const data=parallelSplit(),source={id:'Task',type:'bpmn:Task',parentId:'Upper',x:200,y:240,width:100,height:80},flow={id:'M',type:'bpmn:SequenceFlow',sourceId:'Task',targetId:'A',routing:{mode:'orthogonal',manual:true,source:{side:'bottom',offset:.5},target:{side:'left',offset:.5}},waypoints:[{x:250,y:320},{x:250,y:400},{x:480,y:400},{x:480,y:540},{x:500,y:540}]};
 data.elements=data.elements.filter(e=>!['Split','F','G','B','Other'].includes(e.id));data.elements.push(source,flow);const before=structuredClone(data);
 const issue=reviewVisualQuality(data,{elementIds:['M']}).issues.find(i=>i.code==='ROUTE_LANE_BORDER_CLEARANCE');assert.ok(issue);assert.equal(issue.clearance,LANE_BORDER_CLEARANCE);assert.equal(issue.preservesManualRoute,true);assert.equal(issue.suggestedOperation.sourceSide,'bottom');assert.equal(issue.suggestedOperation.targetSide,'left');
 assert.deepEqual(planReconnectPreview(data,'M').waypoints,flow.waypoints);assert.deepEqual(data,before);
 const repaired=routeOrthogonal(data,issue.suggestedOperation);assert.equal(laneRouteConflicts(repaired.waypoints,laneBoundaries(data)).length,0);assert.equal(repaired.routing.source.side,'bottom');assert.equal(repaired.routing.target.side,'left');
});
test('straight perpendicular crossings, including redundant collinear points on the separator, remain valid',()=>{
 const data=parallelSplit(),borders=laneBoundaries(data),points=[{x:200,y:380},{x:200,y:400},{x:200,y:420}];assert.deepEqual(laneRouteConflicts(points,borders),[]);
 const flow={id:'Cross',type:'bpmn:SequenceFlow',waypoints:points};const quality=reviewVisualQuality({elements:[...data.elements.filter(e=>e.type==='bpmn:Lane'),flow]});assert.ok(!quality.issues.some(i=>i.code==='ROUTE_LANE_BORDER_CLEARANCE'));
});
test('vertical separators receive the same corridor, and finite boundaries do not extend through the whole sheet',()=>{
 const data=parallelSplit();data.elements=data.elements.map(e=>e.waypoints?{...e,waypoints:e.waypoints.map(p=>({x:p.y,y:p.x}))}:e.width?{...e,x:e.y,y:e.x,width:e.height,height:e.width}:{...e});
 const plan=routeOrthogonal(data,{elementId:'G',sourceSide:'right',targetSide:'left'}),borders=laneBoundaries(data);assert.equal(borders[0].axis,'x');assert.deepEqual(laneRouteConflicts(plan.waypoints,borders),[]);
 assert.deepEqual(laneRouteConflicts([{x:400,y:1500},{x:400,y:1800}],borders),[]);
});
test('near-edge bends and legs warn at less than 16 px, while a 16 px corridor is accepted',()=>{
 const borders=[{axis:'y',value:400,from:100,to:1000,laneIds:['U','L']}];
 for(const y of [400,404,415])assert.ok(laneRouteConflicts([{x:200,y:300},{x:200,y},{x:500,y},{x:500,y:500}],borders).length);
 assert.deepEqual(laneRouteConflicts([{x:200,y:300},{x:200,y:416},{x:500,y:416},{x:500,y:500}],borders),[]);
 assert.ok(laneRouteConflicts([{x:88,y:300},{x:88,y:400},{x:80,y:400}],borders)[0].bends.length);
 assert.deepEqual(laneRouteConflicts([{x:200,y:400},{x:200,y:400}],borders),[]);
});
test('incremental lane review finds affected wires, but unrelated pools and nested lane levels do not form fake borders',()=>{
 const data=parallelSplit(),flow=data.elements.find(e=>e.id==='G');flow.waypoints=[{x:225,y:300},{x:225,y:400},{x:850,y:400},{x:850,y:500}];
 const quality=reviewVisualQuality(data,{elementIds:['Upper']});assert.ok(quality.elementIds.includes('G'));assert.ok(quality.issues.some(i=>i.code==='ROUTE_LANE_BORDER_CLEARANCE'));
 const lanes=data.elements.filter(e=>e.type==='bpmn:Lane');assert.deepEqual(laneBoundaries({elements:[lanes[0],{...lanes[1],parentId:'OtherPool'}]}),[]);
 assert.deepEqual(laneBoundaries({elements:[lanes[0],{...lanes[1],parentId:'NestedLane'}]}),[]);
});
test('preview and group movement use identical lane corridors without modifying unrelated figures or manual wires',()=>{
 const data=parallelSplit(),g=data.elements.find(e=>e.id==='G');Object.assign(g,routeOrthogonal(data,{elementId:'G',sourceSide:'bottom',targetSide:'top'}));
 const before=structuredClone(data),plans=planMovedRoutes(data,{elementIds:['B'],delta:{x:40,y:20}});assert.deepEqual(data,before);assert.deepEqual(plans.map(p=>p.elementId),['G']);assert.deepEqual(laneRouteConflicts(plans[0].waypoints,laneBoundaries(data)),[]);
 const final=structuredClone(data),b=final.elements.find(e=>e.id==='B');b.x+=40;b.y+=20;assert.deepEqual(plans,planMovedRoutes(final,{elementIds:['B']}));
});
test('an impossible fixed departure is rejected locally rather than changing its side or its manual model',()=>{
 const data=parallelSplit(),source=data.elements.find(e=>e.id==='Split');source.y=370;const before=structuredClone(data);
 assert.throws(()=>routeOrthogonal(data,{elementId:'G',sourceSide:'right',targetSide:'top'}),{code:'ROUTE_BLOCKED'});assert.deepEqual(data,before);
});
