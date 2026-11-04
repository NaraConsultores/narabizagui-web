import {routeOrthogonal,inferAnchor,anchorPoint,simplifyOrthogonal,orthogonalizeWaypoints,routeMetrics} from './routing.mjs';
import {same,pointEqual,segments,segmentContact,lineHitsBox} from './geometry.mjs';
const fail=(code,message)=>Object.assign(Error(message),{code});
export function projectRoute(points,point){
  let best;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;if(!length)continue;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)),p={x:a.x+dx*t,y:a.y+dy*t},distance=Math.hypot(p.x-point.x,p.y-point.y);
    if(!best||distance<best.distance)best={point:p,index:i-1,distance};
  }
  return best;
}
export function planReconnectPreview(snapshot,elementId,{sourceId,targetId,sourcePoint,targetPoint,routing}={}){
  const index=new Map(snapshot.elements.map(e=>[e.id,e])),connection=index.get(elementId),source=index.get(sourceId||connection?.sourceId),target=index.get(targetId||connection?.targetId);
  if(!connection||!source||!target)throw fail('ROUTE_GEOMETRY_MISSING','Faltan los extremos de la conexión.');
  const old=routing||connection.routing||{},a=sourcePoint?inferAnchor(source,sourcePoint):old.source||inferAnchor(source,connection.waypoints[0]),b=targetPoint?inferAnchor(target,targetPoint):old.target||inferAnchor(target,connection.waypoints.at(-1));
  const virtual={...connection,sourceId:source.id,targetId:target.id,routing:{...old,mode:'orthogonal',source:a,target:b,anchorPolicy:{...old.anchorPolicy,...(sourcePoint?{source:'fixed'}:{}),...(targetPoint?{target:'fixed'}:{})}}};
  if(old.manual&&connection.waypoints.length>2){
    const repair=(points,shape,anchor)=>{
      const first=anchorPoint(shape,anchor.side,anchor.offset),v={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]}[anchor.side],next=points[1];points[0]=first;
      if((next.x-first.x)*v[0]+(next.y-first.y)*v[1]>1){if(v[0])next.y=first.y;else next.x=first.x;}
      else{const stub={x:first.x+v[0]*12,y:first.y+v[1]*12};points.splice(1,0,stub,v[0]?{x:stub.x,y:next.y}:{x:next.x,y:stub.y});}
      return points;
    };
    let points=connection.waypoints.map(p=>({...p}));points=repair(points,source,a);points=repair(points.reverse(),target,b).reverse();
    points=orthogonalizeWaypoints(points,{sourceSide:a.side,targetSide:b.side});
    // A movement is not consent to discard the user's interior bends. Quality
    // exposes collisions and the local recalculate action releases the route.
    return{waypoints:points,routing:{...virtual.routing,manual:true}};
  }
  const plan=routeOrthogonal({...snapshot,elements:snapshot.elements.map(e=>e.id===elementId?virtual:e)},{elementId});
  if(old.manual)plan.routing.manual=true;return plan;
}
// A disposable view of one drag closure. The editor and the ghost use the same
// order and geometry; incident automatic routes cannot bias each other with
// their old paths. No other connection or sheet is laid out.
export function planMovedRoutes(snapshot,{elementIds,delta={x:0,y:0}}){
  const moved=new Set(elementIds),shift=p=>({...p,x:p.x+delta.x,y:p.y+delta.y});
  const elements=snapshot.elements.map(e=>{
    const both=e.waypoints&&moved.has(e.sourceId)&&moved.has(e.targetId);
    return{...e,...(moved.has(e.id)&&!e.waypoints?shift(e):{}),...(e.labelBounds&&(moved.has(e.id)||moved.has(e.id+'_label'))?{labelBounds:shift(e.labelBounds)}:{}),...(both?{waypoints:e.waypoints.map(shift)}:{})};
  });
  const data={...snapshot,elements},affectedIds=new Set(elements.filter(e=>e.waypoints?.length>1&&(moved.has(e.sourceId)||moved.has(e.targetId))).map(e=>e.id)),plans=[];
  let expanded=true;while(expanded){expanded=false;for(const e of elements)if(e.routing?.sharedWith&&affectedIds.has(e.routing.sharedWith)&&!affectedIds.has(e.id)){affectedIds.add(e.id);expanded=true;}}
  const affected=elements.filter(e=>affectedIds.has(e.id)).sort((a,b)=>a.id.localeCompare(b.id));
  for(const e of affected)if(e.routing?.manual===false&&!e.routing.sharedWith)e.waypoints=[];
  // Manual/shared paths remain obstacles with their intended bends intact.
  for(const e of affected.filter(e=>e.routing?.manual!==false||e.routing.sharedWith)){
    if(!e.routing)continue;
    try{const plan=planReconnectPreview(data,e.id,{routing:{...e.routing,manual:true}});Object.assign(e,plan);plans.push({elementId:e.id,...plan});}catch(error){if(!['ROUTE_BLOCKED','ROUTE_SELF_LOOP'].includes(error.code))throw error;}
  }
  for(const e of affected.filter(e=>e.routing?.manual===false&&!e.routing.sharedWith)){
    try{const plan=routeOrthogonal(data,{elementId:e.id});Object.assign(e,plan);plans.push({elementId:e.id,...plan});}catch(error){if(!['ROUTE_BLOCKED','ROUTE_SELF_LOOP'].includes(error.code))throw error;}
  }
  const resolved=new Set(),resolve=e=>{
    if(resolved.has(e.id))return;resolved.add(e.id);const r=e.routing,reference=elements.find(f=>f.id===r?.sharedWith);if(!reference)return;
    if(affectedIds.has(reference.id))resolve(reference);
    const both=moved.has(reference.sourceId)&&moved.has(reference.targetId),point=both?shift(r.joinPoint):r.joinPoint;
    try{const plan=shareConnectionPath(data,{elementId:e.id,withConnectionId:reference.id,point,end:r.sharedEnd});Object.assign(e,plan);const slot=plans.findIndex(p=>p.elementId===e.id);if(slot>=0)plans.splice(slot,1);plans.push({elementId:e.id,...plan});}catch(error){if(!['ROUTE_BLOCKED','SHARED_ROUTE_DIAGONAL','SHARED_ROUTE_EMPTY','SHARED_ROUTE_CYCLE'].includes(error.code))throw error;}
  };
  for(const e of affected.filter(e=>e.routing?.sharedWith))resolve(e);
  return plans;
}
export function shareConnectionTail(snapshot,{elementId,withConnectionId,point,sourceSide,sourceOffset}={}){
  const index=new Map(snapshot.elements.map(e=>[e.id,e])),connection=index.get(elementId),reference=index.get(withConnectionId),source=index.get(connection?.sourceId),target=index.get(reference?.targetId);
  if(!connection||!reference||connection===reference||!source||!target||connection.targetId!==reference.targetId)throw fail('SHARED_TARGET_REQUIRED','Las conexiones deben conservar el mismo destino para compartir un tramo.');
  if(!routeMetrics(reference.waypoints).orthogonal)throw fail('SHARED_ROUTE_DIAGONAL','El recorrido de referencia debe ser ortogonal.');
  const join=projectRoute(reference.waypoints,point);if(!join)throw fail('SHARED_ROUTE_EMPTY','Selecciona un tramo de la conexión.');
  const a=reference.waypoints[join.index],b=reference.waypoints[join.index+1],horizontal=same(a.y,b.y),positive=horizontal?b.x>a.x:b.y>a.y,p=join.point,center={x:source.x+source.width/2,y:source.y+source.height/2};
  const side=horizontal&&Math.abs(center.y-p.y)>8?(center.y<p.y?'top':'bottom'):!horizontal&&Math.abs(center.x-p.x)>8?(center.x<p.x?'left':'right'):horizontal?(positive?'left':'right'):(positive?'top':'bottom');
  const portal={id:'__nara_route_portal',type:'bpmn:Task',parentId:target.parentId,x:p.x-(side==='left'?0:side==='right'?2:1),y:p.y-(side==='top'?0:side==='bottom'?2:1),width:2,height:2};
  const head={...connection,targetId:portal.id,routing:undefined},nearTarget=p.x>=target.x-12&&p.x<=target.x+target.width+12&&p.y>=target.y-12&&p.y<=target.y+target.height+12;
  const elements=snapshot.elements.filter(e=>(e.id===elementId||e.id!==reference.id&&e.routing?.sharedWith!==reference.id)&&(!nearTarget||e.id!==target.id)).map(e=>e.id===elementId?head:e);elements.push(portal);
  const sourceAnchor=connection.routing?.manual?connection.routing.source:null,result=routeOrthogonal({...snapshot,elements},{elementId,sourceSide:sourceSide||sourceAnchor?.side||'auto',sourceOffset:sourceOffset??sourceAnchor?.offset??.5,targetSide:side,targetOffset:.5});
  const waypoints=simplifyOrthogonal([...result.waypoints,...reference.waypoints.slice(join.index+1)]);
  return{waypoints,routing:{mode:'orthogonal',manual:true,source:result.routing.source,target:inferAnchor(target,waypoints.at(-1)),sharedWith:reference.id,sharedEnd:'target',joinPoint:p}};
}
export function shareConnectionPath(snapshot,options){
  const index=new Map(snapshot.elements.map(e=>[e.id,e]));const seen=new Set([options.elementId]);
  for(let e=index.get(options.withConnectionId);e;e=index.get(e.routing?.sharedWith)){if(seen.has(e.id))throw fail('SHARED_ROUTE_CYCLE','Elige una conexión que no dependa de este mismo tramo.');seen.add(e.id);}
  if(options.end!=='source')return shareConnectionTail(snapshot,options);
  const reversed={...snapshot,elements:snapshot.elements.map(e=>e.waypoints?{...e,sourceId:e.targetId,targetId:e.sourceId,waypoints:e.waypoints.slice().reverse(),routing:e.routing?{...e.routing,source:e.routing.target,target:e.routing.source}:undefined}:e)};
  const result=shareConnectionTail(reversed,{...options,sourceSide:options.targetSide,sourceOffset:options.targetOffset});
  return{waypoints:result.waypoints.reverse(),routing:{...result.routing,source:result.routing.target,target:result.routing.source,sharedEnd:'source'}};
}
export function intentionalSharedContact(a,b,p,q,r,s,hit){
  const ar=a.routing||{},br=b.routing||{};
  if(!(a.targetId&&a.targetId===b.targetId||a.sourceId&&a.sourceId===b.sourceId&&(ar.sharedEnd==='source'||br.sharedEnd==='source')))return false;
  if(!(ar.sharedWith===b.id||br.sharedWith===a.id||ar.sharedWith&&ar.sharedWith===br.sharedWith))return false;
  const directed=(q.x-p.x)*(s.x-r.x)+(q.y-p.y)*(s.y-r.y)>0;
  if(hit.type==='overlap')return directed;
  if(hit.type!=='contact'||!hit.point)return false;
  if([ar.joinPoint,br.joinPoint].some(p=>p&&pointEqual(p,hit.point)))return true;
  return segments(a).some(([u,v])=>segments(b).some(([w,z])=>{const shared=segmentContact(u,v,w,z);return shared?.type==='overlap'&&(v.x-u.x)*(z.x-w.x)+(v.y-u.y)*(z.y-w.y)>0&&projectRoute([u,v],hit.point)?.distance<.01&&projectRoute([w,z],hit.point)?.distance<.01;}));
}
