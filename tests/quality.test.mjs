import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewVisualQuality} from '../plugins/naraflows/shared/quality.mjs';
const task={id:'T',type:'bpmn:UserTask',name:'Review request',x:100,y:100,width:180,height:100,parentId:'Lane',textLayout:{rendered:true,fits:true,contentPreserved:true,fontSize:16,bounds:{x:140,y:120,width:120,height:40},markerBounds:[{x:108,y:108,width:20,height:22}]}};
test('a narrow pool cannot hide wider lanes from incremental visual quality',()=>{
 const r=reviewVisualQuality({elements:[{id:'P',type:'bpmn:Participant',x:0,y:0,width:500,height:300},{id:'L',type:'bpmn:Lane',parentId:'P',x:30,y:0,width:900,height:300}]},{elementIds:['P']});assert.ok(r.issues.some(i=>i.code==='LANE_OUTSIDE_PARTICIPANT'));assert.equal(r.ok,false);
});
test('quality uses rendered text, icon clearance and lane borders separately from business approval',()=>{
 const bad={...task,textLayout:{...task.textLayout,fits:false,bounds:{x:105,y:95,width:200,height:50}}};
 const r=reviewVisualQuality({elements:[bad,{id:'Lane',type:'bpmn:Lane',x:90,y:100,width:220,height:200}]});
 assert.deepEqual(r.issues.map(x=>x.code),['TEXT_OUTSIDE_ACTIVITY','TEXT_OVER_MARKER','TEXT_OVER_LANE_BORDER']);assert.equal(r.businessApproval,false);
});
test('incremental quality expands to incident wires and reports long detours and invalid metadata',()=>{
 const r=reviewVisualQuality({elements:[task,{id:'D',type:'bpmn:DataObjectReference',x:350,y:150,width:36,height:50},{id:'F',sourceId:'T',targetId:'D',waypoints:[{x:280,y:150},{x:280,y:700},{x:350,y:700},{x:350,y:175}],routing:{target:{side:'invalid',offset:.5}}}]},{elementIds:['T']});
 assert.ok(r.elementIds.includes('F'));assert.ok(r.issues.some(x=>x.code==='ROUTE_DETOUR'));assert.ok(r.issues.some(x=>x.code==='ROUTE_ANCHOR_INVALID'));
});
test('incomplete text coverage cannot pass a complete visual check; mixed font sizes are exposed',()=>{
 const r=reviewVisualQuality({elements:[task,{...task,id:'T2',textLayout:undefined,visualStyle:{fontSize:12}}]});
 assert.equal(r.complete,false);assert.deepEqual(r.coverage.missingRenderedText,['T2']);assert.ok(r.issues.some(x=>x.code==='ACTIVITY_FONT_INCONSISTENT'));
});
