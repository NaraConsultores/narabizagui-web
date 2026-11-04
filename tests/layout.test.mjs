import test from 'node:test';
import assert from 'node:assert/strict';
import {planContainerFit} from '../plugins/naraflows/shared/layout.mjs';
test('container fit respects manually placed shapes, stages, wire segments and label bounds without relayout',()=>{
 const snapshot={elements:[{id:'P',type:'bpmn:Participant',x:50,y:50,width:1500,height:500},{id:'L',type:'bpmn:Lane',parentId:'P',x:80,y:50,width:1470,height:500},{id:'A',type:'bpmn:Task',parentId:'L',x:150,y:150,width:200,height:100},{id:'B',type:'bpmn:Task',parentId:'L',x:600,y:150,width:200,height:100,labelBounds:{x:590,y:260,width:240,height:30}},{id:'F',sourceId:'A',targetId:'B',waypoints:[{x:350,y:200},{x:350,y:350},{x:850,y:350},{x:850,y:200},{x:800,y:200}]},{id:'Stage_1',type:'bpmn:Group',x:100,y:50,width:800,height:500}]},before=JSON.stringify(snapshot);
 const op=planContainerFit(snapshot,'P');assert.equal(op.width,890);assert.equal(op.height,500);assert.equal(op.x,50);assert.equal(JSON.stringify(snapshot),before);
 assert.throws(()=>planContainerFit(snapshot,'A'),{code:'CONTAINER_FIT_UNSUPPORTED'});
});
