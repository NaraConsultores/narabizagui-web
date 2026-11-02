'use strict';
(() => {
  const fail=(message,details={})=>{throw Object.assign(Error(message),{code:'INVALID_STRUCTURE'},details);};
  const names=value=>Array.isArray(value)&&value.length>=1&&value.length<=10&&value.every(v=>typeof v==='string'&&v.trim()&&v.length<=120);
  const nodeTypes=['bpmn:Task','bpmn:UserTask','bpmn:ManualTask','bpmn:ServiceTask','bpmn:SubProcess','bpmn:CallActivity','bpmn:StartEvent','bpmn:EndEvent','bpmn:ExclusiveGateway','bpmn:ParallelGateway'],activityTypes=nodeTypes.slice(0,6);
  const aliasPattern=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/,reserved=/^(pool|lane\d+|stage\d+)$/,size=v=>v===undefined||Number.isFinite(v)&&v>=20&&v<=1000;
  const identity=root=>{const bo=root.businessObject,participants=bo.participants||[];return{id:root.id,name:bo.name||'',processId:bo.$type==='bpmn:Process'?bo.id:participants.length===1?participants[0].processRef?.id:undefined};};
  function create(modeler){
    const modeling=modeler.get('modeling'),factory=modeler.get('elementFactory'),bpmn=modeler.get('bpmnFactory'),canvas=modeler.get('canvas'),registry=modeler.get('elementRegistry');
    function LaneSetState(){
      this.execute=context=>{if(!context.initialized){context.before=context.process.laneSets?.slice();context.initialized=true;}if(context.after)context.process.laneSets=context.after;return[];};
      this.revert=context=>{context.after=context.process.laneSets;context.process.laneSets=context.before;return[];};
    }
    modeler.get('commandStack').registerHandler('nara.structure.laneSets',LaneSetState);
    function DefinitionOrder(){
      this.execute=context=>{if(!context.before){context.before=[];const seen=new Set(),visit=owner=>{if(!owner?.$type||seen.has(owner))return;seen.add(owner);for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(owner))){if(key.startsWith('$')||!('value' in descriptor))continue;const value=descriptor.value;if(Array.isArray(value)){context.before.push({owner,key,values:value.slice()});value.forEach(visit);}else visit(value);}};visit(context.definitions);}return[];};
      this.revert=context=>{context.before.forEach(({owner,key,values})=>{owner[key]=values.slice();});return[];};
    }
    modeler.get('commandStack').registerHandler('nara.structure.order',DefinitionOrder);
    const preserveOrder=()=>modeler.get('commandStack').execute('nara.structure.order',{definitions:modeler.getDefinitions()});
    function prepareLanes(element){preserveOrder();let process=element.businessObject.processRef||element.businessObject;while(process&&!['bpmn:Process','bpmn:SubProcess'].includes(process.$type))process=process.$parent;if(!process)fail('No se encontró el proceso de los carriles.');modeler.get('commandStack').execute('nara.structure.laneSets',{process});}
    function matrix(op){
      if(!names(op.lanes)||!names(op.stages))fail('La matriz requiere de 1 a 10 nombres de carriles y etapas.');
      const x=op.x??100,y=op.y??140,width=op.width??Math.max(1080,op.stages.length*300+60),rowHeight=op.rowHeight??180;
      if(![x,y,width,rowHeight].every(Number.isFinite)||Math.abs(x)>10000||Math.abs(y)>10000||width<op.stages.length*220+60||width>10000||rowHeight<140||rowHeight>600)fail('Dimensiones de matriz inválidas.');
      const activities=op.activities||[],links=op.links||[],keys=new Set(),linkAliases=new Set(),defaults=op.activitySize||{};
      if(!Array.isArray(activities)||activities.length>100||!Array.isArray(links)||links.length>200)fail('La matriz admite hasta 100 figuras y 200 conexiones.');
      if(!size(defaults.width)||!size(defaults.height))fail('activitySize admite width y height entre 20 y 1000.');
      for(const a of activities){
        if(typeof a.key!=='string'||!aliasPattern.test(a.key)||reserved.test(a.key)||keys.has(a.key))fail('Clave de figura inválida, reservada o repetida: '+a.key+'. pool, laneN y stageN se reservan para la matriz.',{alias:String(a.key)});
        if(!Number.isInteger(a.lane)||a.lane<1||a.lane>op.lanes.length||!Number.isInteger(a.stage)||a.stage<1||a.stage>op.stages.length)fail('La figura '+a.key+' usa un carril o una etapa fuera de la matriz.',{alias:a.key});
        if(!nodeTypes.includes(a.bpmnType||'bpmn:Task')||typeof(a.name??'')!=='string'||(a.name||'').length>120||![a.xOffset??0,a.yOffset??0].every(Number.isFinite))fail('Tipo, nombre o desplazamiento inválido en la figura '+a.key+'.',{alias:a.key});
        if(!size(a.width)||!size(a.height)||(a.width!==undefined||a.height!==undefined)&&!activityTypes.includes(a.bpmnType||'bpmn:Task'))fail('width y height (20 a 1000) solo se aplican a actividades: '+a.key+'.',{alias:a.key});
        keys.add(a.key);
      }
      for(const link of links){
        const name=link.as||link.from+'->'+link.to;
        if(!keys.has(link.from)||!keys.has(link.to)||link.from===link.to)fail('La conexión '+name+' debe referenciar dos claves de figuras distintas de la matriz.',{alias:name});
        if(link.as!==undefined&&(typeof link.as!=='string'||!aliasPattern.test(link.as)||reserved.test(link.as)||keys.has(link.as)||linkAliases.has(link.as)))fail('Alias de conexión inválido, reservado o repetido: '+link.as+'.',{alias:String(link.as)});
        if(link.label!==undefined&&(typeof link.label!=='string'||link.label.length>120))fail('La etiqueta de la conexión '+name+' admite hasta 120 caracteres.',{alias:name});
        if(link.as)linkAliases.add(link.as);
      }
      const reusable=e=>e?.type==='bpmn:Participant'&&canvas.findRoot(e)===canvas.getRootElement()&&e.di?.isExpanded!==false&&!(e.children||[]).some(c=>!c.labelTarget);
      // After clear the sheet keeps one empty participant: reuse it so the sheet keeps its name and IDs.
      const rootShapes=(canvas.getRootElement().children||[]).filter(e=>!e.labelTarget);
      let pool=op.poolId?registry.get(op.poolId):rootShapes.length===1&&reusable(rootShapes[0])?rootShapes[0]:null;
      if(op.poolId&&!reusable(pool))fail('Para reutilizar un participante debe estar expandido y vacío.',{alias:op.poolId});
      preserveOrder();
      if(!pool){const shape=factory.createParticipantShape({businessObject:bpmn.create('bpmn:Participant',{name:op.name||'Proceso · borrador'}),isExpanded:true});pool=modeling.createShape(shape,{x:x+width/2,y:y+op.lanes.length*rowHeight/2},canvas.getRootElement());}
      modeling.resizeShape(pool,{x,y,width,height:op.lanes.length*rowHeight});
      if(op.name)modeling.updateLabel(pool,op.name);
      // The native splitter maintains laneSets and flowNodeRef associations.
      modeler.get('commandStack').execute('nara.structure.laneSets',{process:pool.businessObject.processRef});
      modeling.splitLane(pool,op.lanes.length);
      const lanes=registry.getAll().filter(e=>e.type==='bpmn:Lane'&&e.parent===pool).sort((a,b)=>a.y-b.y);
      if(lanes.length!==op.lanes.length)fail('No se pudo confirmar el número de carriles nativos.');
      lanes.forEach((lane,index)=>modeling.updateLabel(lane,op.lanes[index]));
      const stages=[],colWidth=(width-60)/op.stages.length,prefix=op.stagePrefix||window.NaraStagePrefix?.()||'Stage_';
      for(let index=0;index<op.stages.length;index++){
        let number=1;while(registry.get(prefix+'Etapa_'+number))number++;
        const shape=factory.createShape({type:'bpmn:Group',businessObject:bpmn.create('bpmn:Group',{id:prefix+'Etapa_'+number}),width:colWidth,height:pool.height+32});
        const stage=modeling.createShape(shape,{x:x+60+(index+.5)*colWidth,y:y-32+(pool.height+32)/2},canvas.getRootElement());
        modeling.updateLabel(stage,op.stages[index]);stages.push(stage);
      }
      const byKey={},rectangles=[];
      for(const a of activities){
        const lane=lanes[a.lane-1],stage=stages[a.stage-1],type=a.bpmnType||'bpmn:Task',sized=activityTypes.includes(type),width=a.width??defaults.width,height=a.height??defaults.height;
        const shape=factory.createShape({type,businessObject:bpmn.create(type,{name:a.name||''}),...(sized&&width!==undefined?{width}:{}),...(sized&&height!==undefined?{height}:{})}),cx=stage.x+stage.width/2+(a.xOffset||0),cy=lane.y+lane.height/2+(a.yOffset||0);
        const rect={x:cx-shape.width/2,y:cy-shape.height/2,width:shape.width,height:shape.height};
        if(rect.x<stage.x+12||rect.x+rect.width>stage.x+stage.width-12||rect.y<lane.y+16||rect.y+rect.height>lane.y+lane.height-16||rectangles.some(r=>rect.x<r.x+r.width+8&&rect.x+rect.width+8>r.x&&rect.y<r.y+r.height+8&&rect.y+rect.height+8>r.y))fail('La figura '+a.key+' ('+shape.width+'×'+shape.height+') no cabe en su cuadrante (carril '+a.lane+', etapa '+a.stage+') o se superpone con otra. Ajusta xOffset/yOffset, width/height o width/rowHeight de la matriz.',{alias:a.key,cell:{x:Math.round(stage.x),y:Math.round(lane.y),width:Math.round(stage.width),height:Math.round(lane.height)}});
        rectangles.push(rect);byKey[a.key]=modeling.createShape(shape,{x:cx,y:cy},lane);
      }
      const connections=links.map(link=>{const connection=modeling.connect(byKey[link.from],byKey[link.to],{type:'bpmn:SequenceFlow'});if(link.label)modeling.updateLabel(connection,link.label);return connection;});
      return{element:pool,aliases:{pool:pool.id,...Object.fromEntries(lanes.map((e,i)=>['lane'+(i+1),e.id])),...Object.fromEntries(stages.map((e,i)=>['stage'+(i+1),e.id])),...Object.fromEntries(Object.entries(byKey).map(([key,e])=>[key,e.id])),...Object.fromEntries(links.map((link,i)=>[link.as,connections[i].id]).filter(([key])=>key))},affectedIds:[pool,...lanes,...stages,...Object.values(byKey),...connections].map(e=>e.id),sheet:identity(canvas.getRootElement())};
    }
    function clear(op){
      if(op.scope!=='active')fail('La limpieza requiere el ámbito explícito active.');
      const root=canvas.getRootElement(),previous=identity(root),shapes=(root.children||[]).filter(e=>!e.labelTarget);
      // bpmn-js morphs a collaboration without participants into a new unnamed process,
      // which renames the sheet and breaks CallActivity references. Keep one emptied pool.
      const keep=root.type==='bpmn:Collaboration'?shapes.filter(e=>e.type==='bpmn:Participant'&&e.di?.isExpanded!==false).sort((a,b)=>a.y-b.y||a.x-b.x)[0]:null;
      const removed=keep?[...shapes.filter(e=>e!==keep),...(keep.children||[]).filter(e=>!e.labelTarget)]:shapes;
      if(removed.length){preserveOrder();if(keep?.children?.some(e=>e.type==='bpmn:Lane'))modeler.get('commandStack').execute('nara.structure.laneSets',{process:keep.businessObject.processRef});modeling.removeElements(removed);}
      const current=canvas.getRootElement(),sheet=identity(current),preserved=['id','name','processId'].every(key=>sheet[key]===previous[key]);
      return{element:current,affectedIds:removed.map(e=>e.id),aliases:{},sheet:{...sheet,preserved,...(keep?{keptParticipantId:keep.id}:{}),...(preserved?{}:{previous})}};
    }
    return{matrix,clear,prepareLanes};
  }
  window.NaraMcpStructure={create,nodeTypes};
})();
