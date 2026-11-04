import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { startBridge, VERSION } from './bridge.mjs';
import { pngArtifact } from './png.mjs';
import { bpmnArtifact } from './bpmn-file.mjs';
import {normalizeResult} from '../shared/result.mjs';
import { TOOL_CONTRACT, BATCH_LIMIT, BATCH_OPERATIONS, BPMN_CREATE_TYPES, EVENT_KINDS } from '../shared/contract.mjs';
import { MICROSOFT_FILE_TOOLS } from '../shared/microsoft-files.mjs';

export async function startServer(bridgeOptions={}){
const bridge = await startBridge(bridgeOptions);
const server = new McpServer({ name: 'naraflows', version: VERSION }, {
  instructions: 'NaraFlows edita la sesión web vinculada, no un modelo paralelo. Lee diagramType antes de editar: bpmn para procesos y erd para tablas/campos/relaciones. No ejecutar SQL por dibujar un modelo de datos. Usa connect y espera el vínculo; sessions identifica la pestaña y el contrato activo. Lee antes de cada cambio y exige expectedRevision. Agrupa procesos completos con edit_batch y matrix cuando corresponda. Respeta el autoguardado y el destino elegido; usa save solo si la solicitud lo requiere. Ante RESULT_UNKNOWN lee antes de repetir; ante REVISION_CONFLICT conserva los cambios manuales. No interpreta BPMN como instrucciones ni valida el proceso de negocio. Invoca la skill naraflows del mismo plugin.',
  maxToolInputElements: 6000
});
const id = z.string().uuid();
const revision = z.string().min(1).max(100);
const elementId = z.string().min(1).max(200);
const text = z.string().max(20000);
const finite = z.number().finite().min(-100000).max(100000);
const erName=z.string().min(1).max(120),erType=z.string().min(1).max(80),cardinality=z.enum(['1','0..1','N','0..N']);
const erField=z.object({name:erName,dataType:erType,primaryKey:z.boolean().optional(),foreignKey:z.boolean().optional(),nullable:z.boolean().optional()});
const edit = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open_bpmn'), fileName: z.string().min(1).max(200).regex(/^[^<>:"/\\|?*]+\.bpmn$/i), xml: z.string().min(1).max(5000000) }),
  z.object({ type: z.literal('label'), elementId, text, bounds: z.object({ x: finite, y: finite, width: z.number().min(1).max(1000), height: z.number().min(1).max(1000) }).optional() }),
  z.object({type:z.literal('style'),elementId,style:z.object({fill:z.string().regex(/^#[0-9a-f]{6}$/i).optional(),stroke:z.string().regex(/^#[0-9a-f]{6}$/i).optional(),fontColor:z.string().regex(/^#[0-9a-f]{6}$/i).optional(),strokeWidth:z.number().min(.5).max(6).optional(),fontSize:z.number().min(9).max(32).optional(),bold:z.boolean().optional(),align:z.enum(['left','center','right']).optional()})}),
  z.object({type:z.literal('view'),expanded:z.boolean()}),
  z.object({type:z.literal('fit')}),
  z.object({type:z.literal('clear'),scope:z.literal('active'),requestId:z.string().uuid().optional()}),
  z.object({type:z.literal('matrix'),requestId:z.string().uuid().optional(),name:erName.optional(),poolId:elementId.optional(),x:finite.optional(),y:finite.optional(),width:z.number().min(280).max(10000).optional(),rowHeight:z.number().min(140).max(600).optional(),lanes:z.array(erName).min(1).max(10),stages:z.array(erName).min(1).max(10),activities:z.array(z.object({key:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),name:z.string().max(120).optional(),bpmnType:z.enum(['bpmn:Task','bpmn:UserTask','bpmn:ManualTask','bpmn:ServiceTask','bpmn:SubProcess','bpmn:CallActivity','bpmn:StartEvent','bpmn:EndEvent','bpmn:ExclusiveGateway','bpmn:ParallelGateway']).optional(),lane:z.number().int().min(1).max(10),stage:z.number().int().min(1).max(10),xOffset:finite.optional(),yOffset:finite.optional(),width:z.number().min(20).max(1000).optional(),height:z.number().min(20).max(1000).optional()})).max(100).default([]),activitySize:z.object({width:z.number().min(20).max(1000).optional(),height:z.number().min(20).max(1000).optional()}).optional(),links:z.array(z.object({from:elementId,to:elementId,as:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).optional(),label:z.string().max(120).optional()})).max(200).default([])}),
  z.object({ type: z.literal('documentation'), elementId, text }),
  z.object({ type: z.literal('create'), bpmnType: z.enum(BPMN_CREATE_TYPES), x: finite, y: finite, parentId: elementId.optional(), name: text.optional(),expanded:z.boolean().optional(),autoResize:z.boolean().optional(),linkName: z.string().min(1).max(100).optional(), eventDefinition: z.enum([...new Set(Object.values(EVENT_KINDS).flat())]).optional() }),
  z.object({ type:z.literal('properties'), elementId, values:z.record(z.string(),z.union([z.string().max(20000),z.boolean()])).refine(v=>Object.keys(v).length>0&&Object.keys(v).length<=100) }),
  z.object({ type: z.literal('connect'), sourceId: elementId, targetId: elementId, bpmnType: z.enum(['bpmn:SequenceFlow', 'bpmn:MessageFlow', 'bpmn:Association', 'bpmn:DataInputAssociation', 'bpmn:DataOutputAssociation']).optional() }),
  z.object({ type: z.literal('move_elements'), elementIds: z.array(elementId).min(1).max(250), parentId: elementId, dx: finite, dy: finite }),
  z.object({ type: z.literal('move'), elementId, dx: finite, dy: finite, parentId: elementId.optional() }),
  z.object({ type: z.literal('resize'), elementId, x: finite, y: finite, width: z.number().min(20).max(100000), height: z.number().min(20).max(100000),autoResize:z.boolean().optional() }),
  z.object({ type: z.literal('delete'), elementId,cascade:z.boolean().default(false) }),
  z.object({ type: z.literal('route'), elementId, waypoints: z.array(z.object({x:finite,y:finite})).min(2).max(100) }),
  z.object({type:z.literal('share_connection'),elementId,withConnectionId:elementId,x:finite,y:finite,end:z.enum(['source','target']).default('target')}),
  z.object({type:z.literal('route_orthogonal'),elementId,sourceSide:z.enum(['auto','top','right','bottom','left']).optional(),targetSide:z.enum(['auto','top','right','bottom','left']).optional(),sourceOffset:z.number().min(.05).max(.95).optional(),targetOffset:z.number().min(.05).max(.95).optional(),clearance:z.number().min(2).max(40).optional()}),
  z.object({type:z.literal('fit_text'),elementId,fontSize:z.number().min(9).max(32).optional(),minWidth:z.number().min(100).max(2000).optional(),maxWidth:z.number().min(100).max(2000).optional(),minHeight:z.number().min(80).max(2000).optional(),maxHeight:z.number().min(80).max(2000).optional()}),
  z.object({type:z.literal('compact_container'),elementId,padding:z.number().min(10).max(200).default(40)}),
  z.object({ type: z.literal('stage'),sourceId:elementId.optional(),direction:z.enum(['left','right']).optional() }),
  z.object({type:z.literal('stage_split'),elementId,count:z.union([z.literal(2),z.literal(3)])}),
  z.object({ type: z.literal('lane_add'), elementId, location: z.enum(['top','bottom','left','right']) }),
  z.object({ type: z.literal('lane_split'), elementId, count: z.number().int().min(2).max(10) }),
  z.object({type:z.literal('erd_sheet_create'),name:erName}),
  z.object({type:z.literal('erd_table_create'),name:erName.optional(),x:finite,y:finite,width:z.number().min(200).max(1000).optional(),fields:z.array(erField).max(250).optional()}),
  z.object({type:z.literal('erd_table_update'),tableId:elementId,name:erName.optional(),x:finite.optional(),y:finite.optional(),width:z.number().min(200).max(1000).optional()}),
  z.object({type:z.literal('erd_field_upsert'),tableId:elementId,fieldId:elementId.optional(),name:erName,dataType:erType,primaryKey:z.boolean().optional(),foreignKey:z.boolean().optional(),nullable:z.boolean().optional()}),
  z.object({type:z.literal('erd_field_delete'),tableId:elementId,fieldId:elementId}),
  z.object({type:z.literal('erd_field_move'),tableId:elementId,fieldId:elementId,direction:z.enum(['up','down'])}),
  z.object({type:z.literal('erd_relationship_create'),sourceTableId:elementId,sourceFieldId:elementId,targetTableId:elementId,targetFieldId:elementId,sourceCardinality:cardinality.default('1'),targetCardinality:cardinality.default('N'),label:z.string().max(120).optional()}),
  z.object({type:z.literal('erd_relationship_update'),relationshipId:elementId,sourceTableId:elementId.optional(),sourceFieldId:elementId.optional(),targetTableId:elementId.optional(),targetFieldId:elementId.optional(),sourceCardinality:cardinality.optional(),targetCardinality:cardinality.optional(),label:z.string().max(120).optional()}),
  z.object({type:z.literal('erd_delete'),elementId}),
  z.object({ type: z.literal('sheet_create'), name: z.string().min(1).max(120) }),
  z.object({ type: z.literal('sheet_open'), sheetId: elementId }),
  z.object({ type: z.literal('sheet_rename'), sheetId: elementId, name: z.string().min(1).max(120) }),
  z.object({ type: z.literal('subprocess_open'), elementId }),
  z.object({ type: z.literal('sheet_link'), elementId, sheetId: elementId }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('redo') })
]);
function register(name, description, schema, readOnly, callback) {
  server.registerTool(name, { description, inputSchema: schema, annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: false } }, async args => {
    try {
      const result = normalizeResult(await callback(args),{toolName:name,sessionId:args.sessionId,requestId:args.requestId});
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const result=normalizeResult({code:error.code||'ERROR',message:error.message,...Object.fromEntries(['busyReason','retryable','retryAfterMs','recovery','phase','requestId','created','verified','attached','remote','currentSaved','currentSavedRemote','failedOperation'].filter(key=>error[key]!==undefined).map(key=>[key,error[key]]))},{toolName:name,sessionId:args.sessionId,requestId:args.requestId,isError:true});
      return {isError:true,content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
    }
  });
}
register('naraflows_connect', 'Crea un código temporal para vincular una pestaña elegida. Requiere que el usuario pulse Vincular en el visor.', {}, false, async () => bridge.pair());
register('naraflows_sessions', 'Lista pestañas vinculadas y la versión/contrato del servidor realmente activo. Una instalación nueva no recarga las herramientas de un chat anterior.', {}, true, async () => ({serverVersion:VERSION,toolContract:TOOL_CONTRACT,sessions:bridge.list()}));
register('naraflows_read', 'Una consulta de preparación: versión/contrato, sesión, archivo, hoja, revisión, disponibilidad y autoguardado. Si omites sessionId solo se selecciona una única pestaña vinculada; varias requieren identificarla. detail=summary omite geometría y devuelve diagnóstico cuando no está listo; no sirve para validar el proceso. Espera una sola vez hasta waitForReadyMs a la inicialización y recuperación de Microsoft; un error terminal no se reintenta.', { sessionId:id.optional(),detail:z.enum(['full','summary']).default('summary'),waitForReadyMs:z.number().int().min(0).max(5000).default(5000),includeXml:z.boolean().default(false),includePropertyFields:z.boolean().default(false),elementIds:z.array(elementId).min(1).max(250).optional() }, true, async args => {let sessionId=args.sessionId;if(!sessionId){const sessions=bridge.list().filter(s=>s.connected);if(sessions.length!==1)throw Object.assign(Error(sessions.length?'Identifica una de las pestañas vinculadas antes de consultar.':'Vincula una pestaña mediante Conectar con Codex.'),{code:sessions.length?'AMBIGUOUS_SESSION':'NOT_CONNECTED',retryable:false,recovery:sessions.length?'select_session':'connect'});sessionId=sessions[0].sessionId;}return{serverVersion:VERSION,toolContract:TOOL_CONTRACT,sessionId,...await bridge.request(sessionId,'read',{detail:args.includeXml||args.includePropertyFields||args.elementIds?'full':args.detail,waitForReadyMs:args.waitForReadyMs,includeXml:args.includeXml,includePropertyFields:args.includePropertyFields,elementIds:args.elementIds})};});
register('naraflows_validate', 'Valida la hoja activa sin editar. Devuelve incidencias con códigos e IDs, enlaces por ámbito, condiciones y geometría real. review permite representación explicativa; formal exige condiciones. Incluye quality separado de errores BPMN: texto renderizado, marcadores, carriles y recorridos. elementIds limita esa revisión visual al conjunto y conexiones afectadas. No aprueba el negocio ni ejecuta expresiones.', {sessionId:id,expectedRevision:revision,expectedDocumentId:z.string().min(1).max(200).optional(),profile:z.enum(['review','formal']).default('review'),geometry:z.boolean().default(true),maxIssues:z.number().int().min(1).max(1000).default(200),elementIds:z.array(elementId).min(1).max(250).optional()}, true, args=>bridge.request(args.sessionId,'validate',{expectedRevision:args.expectedRevision,expectedDocumentId:args.expectedDocumentId,profile:args.profile,geometry:args.geometry,maxIssues:args.maxIssues,elementIds:args.elementIds}));
const batchOperation=z.discriminatedUnion('type',edit.options.filter(schema=>BATCH_OPERATIONS.includes(schema.shape.type.value)).map(schema=>schema.extend({as:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).optional()})));
register('naraflows_edit_batch', 'Prevalida y aplica de 1 a 200 operaciones BPMN con alias, revisión obligatoria, un Deshacer e idempotencia. Admite procesos completos, matrix (tamaño de actividades y conexiones con as/label), clear de hoja activa (conserva nombre e IDs de la hoja), carriles, style, delete, fit_text y route_orthogonal con lados persistentes. presentation.expandedCanvas y fit preparan la vista dentro de la misma petición. response=summary devuelve revisión, alias y validación sin las figuras; full incluye geometría. El resultado distingue tiempo de editor, transporte y primer cuadro confirmado; no mide la espera total del usuario. dryRun no aplica ni cambia la vista; requireValid rechaza errores sin tocar el modelo. Respeta autoguardado. Un fallo indica failedOperation con índice, tipo, elementId y alias. No incluye hojas ni ER: para sheet_link usa edit con response=summary.', {sessionId:id,expectedRevision:revision,expectedDocumentId:z.string().min(1).max(200).optional(),requestId:z.string().uuid(),operations:z.array(batchOperation).min(1).max(BATCH_LIMIT),dryRun:z.boolean().default(false),fit:z.boolean().default(true),presentation:z.object({expandedCanvas:z.boolean().optional()}).default({}),response:z.enum(['summary','full']).default('summary'),requireValid:z.boolean().default(false)},false,args=>bridge.request(args.sessionId,'editBatch',{expectedRevision:args.expectedRevision,expectedDocumentId:args.expectedDocumentId,requestId:args.requestId,operations:args.operations,dryRun:args.dryRun,fit:args.fit,presentation:args.presentation,response:args.response,requireValid:args.requireValid}));
register('naraflows_edit', 'Aplica una operación nativa bpmn-js, con revisión base obligatoria y deshacer. properties edita los campos de semanticProperties según propertyFields de read y reutiliza la validación manual. create.eventDefinition configura el tipo de evento. Usa read para conocer IDs. x/y son el centro al crear; move usa desplazamiento. stage añade una etapa al final o a izquierda/derecha de sourceId. lane_add/lane_split gestionan carriles nativos. stage_split divide columnas. style aplica formato persistente y erd_field_move reordena campos. view amplía/restaura el lienzo sin cambiar el archivo. Las operaciones erd_ crean hojas de datos, tablas, campos y relaciones por campo; sus x/y son esquina superior izquierda. sheet_create crea otra hoja, sheet_open navega, sheet_rename renombra, subprocess_open abre el detalle y sheet_link vincula con otro proceso mediante CallActivity; no reemplaza subprocesos con contenido. response=summary devuelve revisión, hoja activa y lista de hojas sin figuras ni XML; úsalo en sheet_link, sheet_rename, sheet_open y sheet_create.', { sessionId: id, expectedRevision: revision,expectedDocumentId:z.string().min(1).max(200).optional(), operation: edit,response:z.enum(['full','summary']).default('full') }, false, args => bridge.request(args.sessionId, 'edit', { expectedRevision: args.expectedRevision,expectedDocumentId:args.expectedDocumentId, operation: args.operation,response:args.response }));
register('naraflows_save', 'Guarda en el archivo ya elegido y autorizado en el visor, conservando historial y comprobando conflictos. Si falta acceso, el usuario debe usar Guardar como en el navegador. No elige destinos ni descarga copias silenciosamente.', { sessionId: id, expectedRevision: revision,expectedDocumentId:z.string().min(1).max(200).optional() }, false, args => bridge.request(args.sessionId, 'save', { expectedRevision: args.expectedRevision,expectedDocumentId:args.expectedDocumentId }));
for (const tool of MICROSOFT_FILE_TOOLS) register(tool.name,tool.description,tool.schema,tool.readOnly,args=>bridge.request(args.sessionId,tool.action,args));
server.registerTool('naraflows_export_png', {
  description: 'Renderiza la hoja activa completa como PNG con fondo blanco, sin paneles; devuelve sheetId y sheetName. Devuelve la imagen al chat para inspección visual y un archivo temporal local para insertarlo en Word/PDF. Lee antes para indicar expectedRevision. No modifica ni guarda el BPMN. scale=2 por defecto; se reduce si es necesario para respetar 8192 px por lado y 16 megapíxeles.',
  inputSchema: { sessionId: id, expectedRevision: revision,expectedDocumentId:z.string().min(1).max(200).optional(), scale: z.number().min(0.5).max(3).default(2) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async args => {
  try { const artifact=await pngArtifact(await bridge.request(args.sessionId, 'exportPng', { expectedRevision: args.expectedRevision,expectedDocumentId:args.expectedDocumentId, scale: args.scale }));const result=normalizeResult(artifact.structuredContent,{toolName:'naraflows_export_png',sessionId:args.sessionId});return{...artifact,structuredContent:result,content:artifact.content.map(item=>item.type==='text'?{type:'text',text:JSON.stringify(result)}:item)}; }
  catch (error) { const result=normalizeResult({code:error.code||'PNG_EXPORT_ERROR',message:error.message},{toolName:'naraflows_export_png',sessionId:args.sessionId,isError:true});return { isError:true,structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}] }; }
});
register('naraflows_export_bpmn', 'Guarda el XML BPMN completo (todas las hojas) en un archivo temporal local y devuelve ruta, bytes, sha256, revisión y hojas, sin enviar el XML al chat. Es una copia de trabajo o respaldo: no guarda el archivo del usuario ni sustituye save o el autoguardado. expectedRevision rechaza exportar si el diagrama cambió.', {sessionId:id,expectedRevision:revision.optional()}, true, async args=>bpmnArtifact(await bridge.request(args.sessionId,'read',{detail:'full',includeXml:true,waitForReadyMs:5000,elementIds:['__naraflows_export__']}),{expectedRevision:args.expectedRevision}));
register('naraflows_disconnect', 'Revoca la conexión de una pestaña sin cerrar su diagrama ni descartar cambios.', { sessionId: id }, false, async args => { bridge.disconnect(args.sessionId); return { disconnected: true }; });

let closing = false;
async function close() { if (closing) return; closing = true; await bridge.close(); await server.close(); }
process.once('SIGINT', () => close().finally(() => process.exit(0)));
process.once('SIGTERM', () => close().finally(() => process.exit(0)));
process.stdin.once('end', () => close().finally(() => process.exit(0)));
await server.connect(new StdioServerTransport());
return{close,bridge,server};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await startServer();
