import {same,pointEqual,lineHitsBox,segmentContact,boxesOverlap,segments,segmentAlongBox} from './geometry.mjs';
import {laneBoundaries,segmentNearLaneBorder,pointNearLaneBorder,LANE_BORDER_CLEARANCE} from './lane-routing.mjs';

export const SIDES=['top','right','bottom','left'];
const vectors={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]};
const fail=(code,message)=>Object.assign(Error(message),{code});
const rect=e=>e&&[e.x,e.y,e.width,e.height].every(Number.isFinite)&&e.width>0&&e.height>0;
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const axis=(a,b)=>same(a.y,b.y)?1:same(a.x,b.x)?2:0;
export function simplifyOrthogonal(points){
  const output=[];
  for(const p of points){
    if(output.length&&pointEqual(output.at(-1),p))continue;
    while(output.length>1&&axis(output.at(-2),output.at(-1))===axis(output.at(-1),p)&&axis(output.at(-1),p)&&((p.x-output.at(-1).x)*(output.at(-1).x-output.at(-2).x)+(p.y-output.at(-1).y)*(output.at(-1).y-output.at(-2).y)>=0))output.pop();
    output.push({x:p.x,y:p.y});
  }
  return output;
}

// Keep the user's endpoints and bends. Only add square elbows where a dragged
// segment would otherwise be diagonal; this is not a full automatic reroute.
export function orthogonalizeWaypoints(points,{sourceSide,targetSide}={}){
  if(points.length<2)return points.map(p=>({...p}));
  if(points.length===2&&sourceSide&&targetSide&&['left','right'].includes(sourceSide)===['left','right'].includes(targetSide)&&!same(points[0].x,points[1].x)&&!same(points[0].y,points[1].y)){
    const [a,b]=points,horizontal=['left','right'].includes(sourceSide),middle=horizontal?(a.x+b.x)/2:(a.y+b.y)/2;
    return simplifyOrthogonal([a,horizontal?{x:middle,y:a.y}:{x:a.x,y:middle},horizontal?{x:middle,y:b.y}:{x:b.x,y:middle},b]);
  }
  const output=[{...points[0]}];let horizontal=['left','right'].includes(sourceSide);
  for(let i=1;i<points.length;i++){
    const a=output.at(-1),b=points[i];
    if(!same(a.x,b.x)&&!same(a.y,b.y)){
      let firstHorizontal=horizontal;
      if(i===points.length-1&&targetSide)firstHorizontal=['top','bottom'].includes(targetSide);
      output.push(firstHorizontal?{x:b.x,y:a.y}:{x:a.x,y:b.y});
    }
    const previous=output.at(-1);if(!pointEqual(previous,b))horizontal=same(previous.y,b.y);
    output.push({...b});
  }
  return simplifyOrthogonal(output);
}

export function anchorPoint(shape,side,offset=.5){
  if(!rect(shape)||!SIDES.includes(side)||!Number.isFinite(offset)||offset<.05||offset>.95)throw fail('INVALID_ANCHOR','El anclaje requiere un lado y una posición entre 0.05 y 0.95.');
  return side==='top'?{x:shape.x+shape.width*offset,y:shape.y}:side==='bottom'?{x:shape.x+shape.width*offset,y:shape.y+shape.height}:side==='left'?{x:shape.x,y:shape.y+shape.height*offset}:{x:shape.x+shape.width,y:shape.y+shape.height*offset};
}
export function inferAnchor(shape,point){
  if(!rect(shape)||!point)return null;
  const candidates=SIDES.map(side=>({side,distance:side==='left'?Math.abs(point.x-shape.x):side==='right'?Math.abs(point.x-shape.x-shape.width):side==='top'?Math.abs(point.y-shape.y):Math.abs(point.y-shape.y-shape.height)})).sort((a,b)=>a.distance-b.distance);
  const side=candidates[0].side,offset=['top','bottom'].includes(side)?(point.x-shape.x)/shape.width:(point.y-shape.y)/shape.height;
  return{side,offset:Math.max(.05,Math.min(.95,offset))};
}
export function routeMetrics(points){
  const lengths=points.slice(1).map((p,i)=>distance(points[i],p));
  const reversals=points.slice(2).filter((p,i)=>axis(points[i],points[i+1])===axis(points[i+1],p)&&((points[i+1].x-points[i].x)*(p.x-points[i+1].x)+(points[i+1].y-points[i].y)*(p.y-points[i+1].y)<0)).length;
  return{length:lengths.reduce((a,b)=>a+b,0),bends:Math.max(0,points.length-2),shortLegs:lengths.filter(n=>n<8).length,reversals,orthogonal:points.slice(1).every((p,i)=>axis(points[i],p)!==0)};
}
// Older files record the resulting sides, but do not record why they were used.
// Keep that unknown intent fixed until a local recalculation is requested.
export function anchorPolicy(routing,end){return routing?.anchorPolicy?.[end]||(routing?.[end]?'fixed':'auto');}
class Heap{
  data=[];
  push(value){let i=this.data.push(value)-1;while(i){const parent=(i-1)>>1;if(this.data[parent].score<=value.score)break;this.data[i]=this.data[parent];i=parent;}this.data[i]=value;}
  pop(){const first=this.data[0],last=this.data.pop();if(this.data.length){let i=0;while(i*2+1<this.data.length){let child=i*2+1;if(child+1<this.data.length&&this.data[child+1].score<this.data[child].score)child++;if(this.data[child].score>=last.score)break;this.data[i]=this.data[child];i=child;}this.data[i]=last;}return first;}
}
export function routeOrthogonal(snapshot,options){
  const elements=snapshot.elements||[],index=new Map(elements.map(e=>[e.id,e])),connection=index.get(options.elementId),source=index.get(connection?.sourceId),target=index.get(connection?.targetId);
  if(!connection||!rect(source)||!rect(target))throw fail('ROUTE_GEOMETRY_MISSING','La conexión necesita extremos y límites completos en la hoja activa.');
  if(source.id===target.id)throw fail('ROUTE_SELF_LOOP','Conserva el recorrido manual de un bucle que vuelve a la misma figura.');
  const saved=connection.routing||{},sourceSide=options.sourceSide??(anchorPolicy(saved,'source')==='auto'?'auto':saved.source?.side)??'auto',targetSide=options.targetSide??(anchorPolicy(saved,'target')==='auto'?'auto':saved.target?.side)??'auto';
  if(![...SIDES,'auto'].includes(sourceSide)||![...SIDES,'auto'].includes(targetSide))throw fail('INVALID_ANCHOR','Selecciona arriba, derecha, abajo, izquierda o automático.');
  const sourceOffset=options.sourceOffset??saved.source?.offset??.5,targetOffset=options.targetOffset??saved.target?.offset??.5,clearance=options.clearance??10;
  if(!Number.isFinite(clearance)||clearance<2||clearance>40)throw fail('INVALID_ROUTE','La separación debe estar entre 2 y 40.');
  const area={x:Math.min(source.x,target.x)-100,y:Math.min(source.y,target.y)-100,width:Math.max(source.x+source.width,target.x+target.width)-Math.min(source.x,target.x)+200,height:Math.max(source.y+source.height,target.y+target.height)-Math.min(source.y,target.y)+200};
  const laneClearance=Math.max(LANE_BORDER_CLEARANCE,clearance),borders=laneBoundaries(snapshot).filter(b=>b.axis==='y'?b.value>=area.y-laneClearance&&b.value<=area.y+area.height+laneClearance&&b.from<=area.x+area.width&&b.to>=area.x:b.value>=area.x-laneClearance&&b.value<=area.x+area.width+laneClearance&&b.from<=area.y+area.height&&b.to>=area.y);
  const scope=index.get(connection.flowScopeId),insideScope=scope?.type==='bpmn:SubProcess'&&scope.id!==source.id&&scope.id!==target.id;
  const inBounds=p=>(!insideScope||p.x>=scope.x+4&&p.x<=scope.x+scope.width-4&&p.y>=scope.y+28&&p.y<=scope.y+scope.height-4);
  const ancestors=new Set();for(const node of [source,target])for(let p=index.get(node.parentId);p&&!ancestors.has(p.id);p=index.get(p.parentId))ancestors.add(p.id);
  const obstacles=[];
  for(const e of elements){
    if(rect(e)&&!e.waypoints&&!['bpmn:Participant','bpmn:Lane','bpmn:Group','bpmn:Process','bpmn:Collaboration'].includes(e.type)&&!ancestors.has(e.id)){
      const own=[source.id,target.id].includes(e.id),padding=own?0:clearance;
      const box={x:e.x-padding,y:e.y-padding,width:e.width+padding*2,height:e.height+padding*2,id:e.id,own};if(boxesOverlap(box,area))obstacles.push(box);
    }
    if(e.id!==connection.id&&e.labelBounds&&rect(e.labelBounds)&&!['bpmn:Group','bpmn:Lane','bpmn:Participant'].includes(e.type)){
      const b=e.labelBounds,box={x:b.x-3,y:b.y-3,width:b.width+6,height:b.height+6,id:e.id+':label'};if(boxesOverlap(box,area))obstacles.push(box);
    }
  }
  const others=elements.filter(e=>e.id!==connection.id&&e.waypoints?.length>1);
  const segmentCost=(a,b)=>{
    if(!axis(a,b)||!inBounds(a)||!inBounds(b)||obstacles.some(box=>lineHitsBox(a,b,box)||box.own&&segmentAlongBox(a,b,box))||borders.some(border=>segmentNearLaneBorder(a,b,border,laneClearance)))return Infinity;
    let penalty=0;
    for(const other of others){let crossing=false,overlap=false;for(const [c,d]of segments(other)){const contact=segmentContact(a,b,c,d);if(!contact)continue;
      const shared=[connection.sourceId,connection.targetId].some(id=>[other.sourceId,other.targetId].includes(id));
      if(contact.type==='contact'&&shared&&[other.waypoints[0],other.waypoints.at(-1)].some(p=>pointEqual(p,contact.point))&&[a,b].some(p=>pointEqual(p,contact.point)))continue;
      if(contact.type==='overlap')overlap=true;else crossing=true;
    }if(overlap)penalty+=900;else if(crossing)penalty+=160;}
    return distance(a,b)+penalty;
  };
  const normal=(a,b,side)=>{const v=vectors[side];return axis(a,b)&&((b.x-a.x)*v[0]+(b.y-a.y)*v[1])>0;};
  let best=null;
  const pairs=[];
  for(const ss of sourceSide==='auto'?SIDES:[sourceSide])for(const ts of targetSide==='auto'?SIDES:[targetSide]){
    const a=anchorPoint(source,ss,sourceOffset),b=anchorPoint(target,ts,targetOffset),va=vectors[ss],vb=vectors[ts],as={x:a.x+va[0]*clearance,y:a.y+va[1]*clearance},bs={x:b.x+vb[0]*clearance,y:b.y+vb[1]*clearance};
    pairs.push({a,b,as,bs,ss,ts});
  }
  function consider(raw,pair){
    const points=simplifyOrthogonal(raw);if(points.length<2||routeMetrics(points).reversals||!normal(points[0],points[1],pair.ss)||!normal(points.at(-1),points.at(-2),pair.ts))return;
    if(points.slice(1,-1).some(p=>borders.some(b=>pointNearLaneBorder(p,b,laneClearance))))return;
    let score=0;for(let i=1;i<points.length;i++){const cost=segmentCost(points[i-1],points[i]);if(!Number.isFinite(cost))return;score+=cost+Math.max(0,8-distance(points[i-1],points[i]))*8;}
    score+=(points.length-2)*22;
    if(!best||score<best.score-.01||same(score,best.score)&&points.length<best.points.length)best={points,score,pair};
  }
  for(const p of pairs){
    consider([p.a,p.b],p);consider([p.a,{x:p.b.x,y:p.a.y},p.b],p);consider([p.a,{x:p.a.x,y:p.b.y},p.b],p);
    consider([p.a,p.as,{x:p.as.x,y:p.bs.y},p.bs,p.b],p);consider([p.a,p.as,{x:p.bs.x,y:p.as.y},p.bs,p.b],p);
  }
  // A clear L/straight line is already a shortest Manhattan path. Obstacles or
  // crossings trigger a bounded local visibility-grid search, not a global tour.
  const perfect=best&&best.score<=distance(best.pair.a,best.pair.b)+22+.01;
  if(!perfect&&obstacles.length<=90){
    const rails=axis=>borders.flatMap(b=>b.axis===axis?[b.value-laneClearance,b.value+laneClearance]:[b.from-laneClearance,b.to+laneClearance]).filter(v=>v>=area[axis]&&v<=area[axis]+(axis==='x'?area.width:area.height));
    const xs=[...new Set([...pairs.flatMap(p=>[p.a.x,p.b.x,p.as.x,p.bs.x]),...obstacles.flatMap(b=>[b.x-(b.own?clearance:0),b.x+b.width+(b.own?clearance:0)]),...rails('x'),area.x,area.x+area.width])].sort((a,b)=>a-b);
    const ys=[...new Set([...pairs.flatMap(p=>[p.a.y,p.b.y,p.as.y,p.bs.y]),...obstacles.flatMap(b=>[b.y-(b.own?clearance:0),b.y+b.height+(b.own?clearance:0)]),...rails('y'),area.y,area.y+area.height])].sort((a,b)=>a-b);
    if(xs.length*ys.length<=18000){
      const point=i=>({x:xs[i%xs.length],y:ys[Math.floor(i/xs.length)]}),edgeCache=new Map();
      const cost=(i,j)=>{const key=i<j?i+':'+j:j+':'+i;if(!edgeCache.has(key))edgeCache.set(key,segmentCost(point(i),point(j)));return edgeCache.get(key);};
      for(const pair of pairs){
        const start=ys.indexOf(pair.a.y)*xs.length+xs.indexOf(pair.a.x),end=ys.indexOf(pair.b.y)*xs.length+xs.indexOf(pair.b.x),heap=new Heap(),dist=new Map(),previous=new Map();
        heap.push({node:start,dir:0,cost:0,score:distance(pair.a,pair.b)});dist.set(start*5,0);let found;
        while(heap.data.length){const current=heap.pop(),key=current.node*5+current.dir;if(current.cost!==dist.get(key))continue;if(best&&current.score>=best.score)break;
          if(current.node===end){found=key;break;}
          const x=current.node%xs.length,y=Math.floor(current.node/xs.length),a=point(current.node);
          for(const next of [x>0?current.node-1:-1,x+1<xs.length?current.node+1:-1,y>0?current.node-xs.length:-1,y+1<ys.length?current.node+xs.length:-1]){
            if(next<0)continue;const b=point(next),dir=same(a.y,b.y)?(b.x>a.x?1:2):(b.y>a.y?3:4);if(current.dir&&dir!==current.dir&&Math.ceil(dir/2)===Math.ceil(current.dir/2)||!current.dir&&!normal(a,b,pair.ss)||next===end&&!normal(b,a,pair.ts))continue;
            if(current.dir&&current.dir!==dir&&borders.some(border=>pointNearLaneBorder(a,border,laneClearance)))continue;
            const edge=cost(current.node,next);if(!Number.isFinite(edge))continue;
            const value=current.cost+edge+(current.dir&&current.dir!==dir?22:0),nextKey=next*5+dir;
            if(value>=(dist.get(nextKey)??Infinity))continue;dist.set(nextKey,value);previous.set(nextKey,key);heap.push({node:next,dir,cost:value,score:value+distance(b,pair.b)});
          }
        }
        if(found!==undefined){const points=[];for(let key=found;key!==undefined;key=previous.get(key))points.push(point(Math.floor(key/5)));consider(points.reverse(),pair);}
      }
    }
  }
  if(!best)throw fail('ROUTE_BLOCKED','No se encontró un recorrido ortogonal local libre. Conserva el recorrido y revisa el espacio o los lados elegidos.');
  const metrics=routeMetrics(best.points),minimum=distance(best.pair.a,best.pair.b),warnings=[];
  if(metrics.length>minimum*2.5&&metrics.length-minimum>200)warnings.push('ROUTE_DETOUR');
  if(metrics.shortLegs)warnings.push('ROUTE_SHORT_LEG');
  return{waypoints:best.points,routing:{mode:'orthogonal',manual:false,anchorPolicy:{source:sourceSide==='auto'?'auto':'fixed',target:targetSide==='auto'?'auto':'fixed'},source:{side:best.pair.ss,offset:sourceOffset},target:{side:best.pair.ts,offset:targetOffset}},metrics,warnings};
}
