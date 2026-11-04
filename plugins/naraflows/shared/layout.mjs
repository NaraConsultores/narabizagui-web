// Shrink only the unused right/bottom margin. Never move or relayout children.
export function planContainerFit(snapshot,elementId,{padding=40}={}){
 const elements=snapshot.elements||[],index=new Map(elements.map(e=>[e.id,e])),container=index.get(elementId);
 const fail=message=>{throw Object.assign(Error(message),{code:'CONTAINER_FIT_UNSUPPORTED'});};
 if(container?.type!=='bpmn:Participant'||!Number.isFinite(padding)||padding<10||padding>200)fail('Selecciona un participante expandido y un margen de 10 a 200.');
 const descendant=e=>{const seen=new Set();for(let p=index.get(e.parentId);p&&!seen.has(p.id);p=index.get(p.parentId)){if(p.id===elementId)return true;seen.add(p.id);}return false;};
 const within=e=>e.x>=container.x&&e.y>=container.y&&e.x+e.width<=container.x+container.width&&e.y+e.height<=container.y+container.height;
 const children=elements.filter(e=>e.id!==elementId&&!e.waypoints&&(descendant(e)||e.type==='bpmn:Group'&&within(e))&&e.type!=='bpmn:Lane');
 if(!children.length)fail('No hay figuras dentro del participante para calcular su tamaño.');
 const ids=new Set(children.map(e=>e.id)),bounds=children.flatMap(e=>[{x:e.x,y:e.y,width:e.width,height:e.height},...(e.textLayout?.bounds?[e.textLayout.bounds]:e.labelBounds?[e.labelBounds]:[])]);
 for(const e of elements)if(e.waypoints&&ids.has(e.sourceId)&&ids.has(e.targetId))bounds.push(...e.waypoints.map(p=>({...p,width:0,height:0})),...(e.labelBounds?[e.labelBounds]:[]));
 const right=Math.max(...bounds.map(b=>b.x+b.width)),bottom=Math.max(...bounds.map(b=>b.y+b.height));
 const hasLanes=elements.some(e=>e.type==='bpmn:Lane'&&descendant(e));
 return{type:'resize',elementId,x:container.x,y:container.y,width:Math.min(container.width,Math.max(300,right-container.x+padding)),height:hasLanes?container.height:Math.min(container.height,Math.max(140,bottom-container.y+padding)),autoResize:false};
}
