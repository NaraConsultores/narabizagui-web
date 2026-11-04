import {boxesOverlap,lineHitsBox,segments,segmentAlongBox} from './geometry.mjs';
import {routeMetrics,simplifyOrthogonal,anchorPoint,anchorPolicy,routeOrthogonal} from './routing.mjs';
import {laneBoundaries,laneRouteConflicts} from './lane-routing.mjs';
const activity=e=>/Task$/.test(e.type)||e.type==='bpmn:CallActivity'||e.type==='bpmn:SubProcess'&&e.expanded!==true;
export function reviewVisualQuality(snapshot,{elementIds,maxIssues=200}={}){
  const elements=snapshot.elements||[],index=new Map(elements.map(e=>[e.id,e])),scope=elementIds?new Set(elementIds):null,issues=[];let total=0;
  const borders=laneBoundaries(snapshot);
  if(scope)for(const e of elements)if(e.waypoints&&(scope.has(e.sourceId)||scope.has(e.targetId)))scope.add(e.id);
  if(scope)for(const e of elements)if(e.waypoints?.length>1&&!scope.has(e.id)&&laneRouteConflicts(e.waypoints,borders.filter(b=>b.laneIds.some(id=>scope.has(id)))).length)scope.add(e.id);
  const add=(code,ids,message,details={})=>{if(scope&&!ids.some(id=>scope.has(id)))return;total++;if(issues.length<maxIssues)issues.push({code,severity:'warning',elementIds:ids,message,...details});};
  const affected=e=>!scope||scope.has(e.id),missingText=[];
  for(const e of elements){
    if(e.type==='bpmn:Lane'){
      let parent=index.get(e.parentId);const seen=new Set();
      while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(parent.type==='bpmn:Participant'){if(e.x<parent.x||e.y<parent.y||e.x+e.width>parent.x+parent.width+.1||e.y+e.height>parent.y+parent.height+.1)add('LANE_OUTSIDE_PARTICIPANT',[e.id,parent.id],'El carril se extiende fuera del participante; el ancho renderizado sigue siendo mayor.');break;}parent=index.get(parent.parentId);}
    }
    if(e.waypoints?.length>1&&affected(e)){
      const metrics=routeMetrics(e.waypoints),simple=simplifyOrthogonal(e.waypoints),first=e.waypoints[0],last=e.waypoints.at(-1),minimum=Math.abs(first.x-last.x)+Math.abs(first.y-last.y);
      if(!metrics.orthogonal)add('ROUTE_DIAGONAL',[e.id],'La conexión contiene un tramo diagonal.');
      if(simple.length<e.waypoints.length)add('ROUTE_REDUNDANT_POINTS',[e.id],'El recorrido conserva puntos colineales o repetidos que se pueden eliminar.');
      if(metrics.reversals)add('ROUTE_REVERSAL',[e.id],'La conexión avanza y retrocede inmediatamente sobre el mismo tramo.',{metrics});
      for(const conflict of laneRouteConflicts(e.waypoints,borders)){
        const operation={type:'route_orthogonal',elementId:e.id};for(const end of ['source','target']){operation[end+'Side']=anchorPolicy(e.routing,end)==='auto'?'auto':e.routing?.[end]?.side||'auto';if(e.routing?.[end]?.offset!==undefined)operation[end+'Offset']=e.routing[end].offset;}
        add('ROUTE_LANE_BORDER_CLEARANCE',[e.id,...conflict.laneIds],'Un tramo paralelo o un codo está demasiado cerca del separador entre carriles. Reserva un corredor interior; el cruce perpendicular está permitido.',{...conflict,preservesManualRoute:true,suggestedOperation:operation});
      }
      if(metrics.shortLegs&&metrics.bends)add('ROUTE_SHORT_LEG',[e.id],'La conexión tiene un tramo corto junto a un quiebre.',{metrics});
      if(metrics.length>minimum*2.5&&metrics.length-minimum>200)add('ROUTE_DETOUR',[e.id],'La conexión hace un rodeo largo; evitar cruces no basta para considerarla una buena ruta.',{metrics,minimum});
      for(const shape of [index.get(e.sourceId),index.get(e.targetId)].filter(Boolean)){
        if(segments(e).some(([a,b])=>lineHitsBox(a,b,shape)))add('ROUTE_THROUGH_ENDPOINT',[e.id,shape.id],'El recorrido atraviesa una de sus propias figuras.');
        if(segments(e).some(([a,b])=>segmentAlongBox(a,b,shape)))add('ROUTE_ON_FIGURE_BORDER',[e.id,shape.id],'El recorrido circula sobre el borde de una figura en lugar de separarse de ella.');
      }
      const source=index.get(e.sourceId),target=index.get(e.targetId);
      if(source&&target&&source!==target&&!e.routing?.sharedWith){
        const gap=Math.max(0,source.x-target.x-target.width,target.x-source.x-source.width)+Math.max(0,source.y-target.y-target.height,target.y-source.y-source.height);
        if(metrics.length>gap+80&&metrics.bends>1)try{
          const alternative=routeOrthogonal(snapshot,{elementId:e.id,sourceSide:'auto',targetSide:'auto',sourceOffset:.5,targetOffset:.5});
          if(metrics.length>alternative.metrics.length*1.6&&metrics.length-alternative.metrics.length>80)add('ROUTE_AVOIDABLE_DETOUR',[e.id],'Existe un recorrido local más corto con lados automáticos. Revisa la intención y usa Recalcular solo esta conexión si corresponde.',{metrics,alternative:alternative.metrics,preservesManualRoute:true,suggestedOperation:{type:'route_orthogonal',elementId:e.id,sourceSide:'auto',targetSide:'auto',sourceOffset:.5,targetOffset:.5}});
        }catch(error){if(!['ROUTE_BLOCKED','ROUTE_GEOMETRY_MISSING','ROUTE_SELF_LOOP'].includes(error.code))throw error;}
      }
      for(const [end,point]of [['source',first],['target',last]]){
        const anchor=e.routing?.[end],shape=index.get(e[end+'Id']);
        if(anchor&&shape){try{const expected=anchorPoint(shape,anchor.side,anchor.offset);if(Math.hypot(point.x-expected.x,point.y-expected.y)>2)add('ROUTE_ANCHOR_CHANGED',[e.id,shape.id],'El extremo ya no coincide con el lado de anclaje elegido.',{end,expected,actual:point});}catch{add('ROUTE_ANCHOR_INVALID',[e.id],'El anclaje guardado no tiene un lado y una posición válidos.',{end});}}
      }
    }
    if(!e.name?.trim()||!activity(e)||!affected(e))continue;
    const text=e.textLayout;
    if(!text?.rendered){missingText.push(e.id);continue;}
    if(!text.fits||text.contentPreserved===false)add('TEXT_OUTSIDE_ACTIVITY',[e.id],'El texto no cabe completo en el espacio reservado de la actividad.',{fontSize:text.fontSize,bounds:text.bounds,available:text.available});
    for(const marker of text.markerBounds||[])if(text.bounds&&boxesOverlap(text.bounds,marker))add('TEXT_OVER_MARKER',[e.id],'El texto se superpone al icono o marcador de la actividad.');
    let parent=index.get(e.parentId);const seen=new Set();
    while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(parent.type==='bpmn:Lane'&&text.bounds){const b=text.bounds;if(b.x<parent.x||b.x+b.width>parent.x+parent.width||b.y<parent.y||b.y+b.height>parent.y+parent.height)add('TEXT_OVER_LANE_BORDER',[e.id,parent.id],'El texto de la actividad invade el borde del carril.');break;}parent=index.get(parent.parentId);}
  }
  const activities=elements.filter(e=>activity(e)&&e.name?.trim()&&affected(e)),sizes=new Map();
  for(const e of activities){const size=e.textLayout?.fontSize??e.visualStyle?.fontSize??16;const ids=sizes.get(size)||[];ids.push(e.id);sizes.set(size,ids);}
  if(sizes.size>1)add('ACTIVITY_FONT_INCONSISTENT',activities.map(e=>e.id),'Las actividades del conjunto revisado usan tamaños de letra distintos.',{fontSizes:[...sizes.keys()]});
  // Rendered text can extend beyond an external label's saved DI bounds.
  for(const e of elements.filter(e=>affected(e)&&e.textLayout?.rendered&&e.textLayout.bounds&&!activity(e))){
    const bounds=e.textLayout.bounds;
    for(const f of elements.filter(f=>f.id!==e.id&&f.waypoints?.length>1))if(segments(f).some(([a,b])=>lineHitsBox(a,b,bounds)))add('RENDERED_TEXT_OVER_LINE',[e.id,f.id],'El texto renderizado se superpone a una línea.');
  }
  return{ok:total===0,complete:missingText.length===0&&!snapshot.elementsTruncated&&!snapshot.elementsFiltered&&total<=maxIssues,scope:scope?'affected-elements':'active-sheet',elementIds:scope?[...scope]:undefined,issues,totalIssues:total,coverage:{missingRenderedText:missingText},businessApproval:false};
}
