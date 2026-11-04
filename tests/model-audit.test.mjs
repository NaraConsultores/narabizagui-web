import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, compareSnapshots, planOperations, segmentContact, lineHitsBox } from '../plugins/naraflows/shared/audit.mjs';
const point=(x,y)=>({x,y}), flow=(id,waypoints,sourceId,targetId)=>({id,type:'bpmn:SequenceFlow',waypoints,sourceId,targetId}), node=(id,x,y)=>({id,type:'bpmn:Task',x,y,width:40,height:40,flowScopeId:'Process'});
test('geometry reports IDs for object hits, intersections, overlap and bend contacts',()=>{
 const elements=[node('A',0,0),node('B',200,0),node('Obstacle',90,0),flow('Across',[point(40,20),point(200,20)],'A','B'),flow('Vertical',[point(100,-40),point(100,100)]),flow('Bend',[point(160,80),point(160,20),point(190,20)])];
 const issues=validateSnapshot({elements}).issues;
 assert.ok(issues.some(i=>i.code==='FLOW_THROUGH_FIGURE'&&i.elementIds.includes('Obstacle')));
 for(const code of ['LINE_CROSSING','UNINTENDED_CONTACT','LINE_OVERLAP'])assert.ok(issues.some(i=>i.code===code));
});
test('diagonal lines and legitimate common ports are handled geometrically',()=>{
 assert.equal(lineHitsBox(point(0,0),point(100,100),{x:40,y:40,width:20,height:20}),true);
 assert.equal(lineHitsBox(point(0,0),point(100,100),{x:40,y:70,width:10,height:10}),false);
 assert.equal(segmentContact(point(0,0),point(40,40),point(0,40),point(40,0)).type,'crossing');
 const elements=[node('A',-40,-20),node('B',100,-20),node('C',-20,100),flow('F1',[point(0,0),point(100,0)],'A','B'),flow('F2',[point(0,0),point(0,100)],'A','C')];
 assert.ok(!validateSnapshot({elements}).issues.some(i=>i.code==='UNINTENDED_CONTACT'));
});
test('external labels are checked against figures, lines and other labels',()=>{
 const elements=[{...node('A',0,0),labelBounds:{x:50,y:0,width:50,height:20}},{...node('B',60,0),labelBounds:{x:70,y:5,width:40,height:20}},flow('Line',[point(40,10),point(130,10)])];
 const codes=validateSnapshot({elements}).issues.map(i=>i.code);
 for(const code of ['LABEL_OVER_LINE','LABEL_OVER_FIGURE','LABEL_OVERLAP'])assert.ok(codes.includes(code));
});

test('internal routes may cross their own expanded subprocess but cannot escape it or cross another figure',()=>{
 const sub={id:'Sub',type:'bpmn:SubProcess',x:0,y:0,width:300,height:160,parentId:'Process'},a={...node('A',20,60),parentId:'Sub',flowScopeId:'Sub'},b={...node('B',220,60),parentId:'Sub',flowScopeId:'Sub'};
 const inside={...flow('Inside',[point(60,80),point(220,80)],'A','B'),parentId:'Sub',flowScopeId:'Sub'};
 const clean=validateSnapshot({elements:[sub,a,b,inside]});assert.ok(!clean.issues.some(i=>i.code==='FLOW_THROUGH_FIGURE'));
 const obstacle={...node('Obstacle',120,60),parentId:'Sub',flowScopeId:'Sub'};
 assert.ok(validateSnapshot({elements:[sub,a,b,obstacle,inside]}).issues.some(i=>i.code==='FLOW_THROUGH_FIGURE'&&i.elementIds.includes('Obstacle')));
 const escaped={...inside,waypoints:[point(60,80),point(60,200),point(220,200),point(220,80)]};
 assert.ok(validateSnapshot({elements:[sub,a,b,escaped]}).issues.some(i=>i.code==='FLOW_OUTSIDE_SCOPE'));
});
test('internal link names are scoped, allow several throws and require a single catch',()=>{
 const event=(id,type,scope,name)=>({id,type,flowScopeId:scope,eventDefinitions:[{type:'bpmn:LinkEventDefinition',name}]});
 const elements=[event('Throw1','bpmn:IntermediateThrowEvent','P','A'),event('Throw2','bpmn:IntermediateThrowEvent','P','A'),event('Catch','bpmn:IntermediateCatchEvent','P','A')];
 assert.equal(validateSnapshot({elements},{geometry:false}).issues.length,0);
 assert.ok(validateSnapshot({elements:[...elements,event('Catch2','bpmn:IntermediateCatchEvent','P','A')]},{geometry:false}).issues.some(i=>i.code==='DUPLICATE_LINK_CATCH'));
 assert.ok(validateSnapshot({elements:[elements[0],event('Nested','bpmn:IntermediateCatchEvent','Sub','A')]},{geometry:false}).issues.every(i=>i.code==='INCOMPLETE_LINK_PAIR'));
});
test('formal branches, default conditions, scope and partial reads cannot falsely pass',()=>{
 const elements=[{id:'G',type:'bpmn:ExclusiveGateway',flowScopeId:'P',defaultFlowId:'F2'},{...node('B',0,0),flowScopeId:'Other'},{id:'F1',type:'bpmn:SequenceFlow',sourceId:'G',targetId:'B'},{id:'F2',type:'bpmn:SequenceFlow',sourceId:'G',targetId:'B',condition:{body:'true'}}];
 const review=validateSnapshot({elements},{geometry:false}),formal=validateSnapshot({elements},{profile:'formal',geometry:false,maxIssues:1});
 assert.ok(review.issues.some(i=>i.code==='BRANCH_CONDITION_MISSING'&&i.severity==='warning'));
 assert.equal(formal.valid,false);assert.equal(formal.complete,false);assert.ok(formal.errors>=3);
 assert.equal(validateSnapshot({elements,elementsFiltered:true}).complete,false);
});
test('planning respects sequential changes and native move side effects',()=>{
 const snapshot={revision:'r',elements:[{id:'A',name:'A',documentation:'',semanticProperties:{linkName:'A'}},{id:'F',waypoints:[point(0,0),point(100,0)]}]};
 const operations=[{type:'label',elementId:'A',text:'A'},{type:'label',elementId:'A',text:'B'},{type:'label',elementId:'A',text:'A'},{type:'move',elementId:'A',dx:10,dy:0},{type:'route',elementId:'F',waypoints:snapshot.elements[1].waypoints}];
 const result=planOperations(snapshot,operations);assert.deepEqual(result.skippedIndices,[0]);assert.equal(result.operations.length,4);
 assert.deepEqual(compareSnapshots(snapshot,{elements:[{id:'A',name:'B'},{id:'New'}]}).removed,['F']);
});
test('offline audits retain provenance and disclose missing geometry',()=>{
 const snapshot={fileName:'Generic.bpmn',revision:'r1',sha256:'hash',activeSheetId:'P',elements:[{id:'E',type:'bpmn:IntermediateCatchEvent',name:'Entrada'}]};
 const result=validateSnapshot(snapshot);
 assert.deepEqual(result.source,{fileName:'Generic.bpmn',revision:'r1',sha256:'hash',activeSheetId:'P'});
 assert.equal(result.complete,false);assert.deepEqual(result.coverage.missingLabelBounds,['E']);assert.deepEqual(result.coverage.missingFigureBounds,['E']);
 assert.equal(validateSnapshot(snapshot,{geometry:false}).complete,true);
});
