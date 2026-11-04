import {z} from 'zod';
export const MICROSOFT_FILES_CONTRACT='microsoft-files-v1';
export const MICROSOFT_FILE_CAPABILITIES={contract:MICROSOFT_FILES_CONTRACT,resolve:true,list:true,create:true,open:true,attach:true,autoSave:true,receipts:true};
const id=z.string().min(1).max(1024), uuid=z.string().uuid();
const session={sessionId:id};
const account={...session,accountRef:uuid,expectedTenantId:id};
const scope={...account,scopeRef:uuid};
const target=z.union([z.strictObject({storage:z.literal('microsoft'),driveId:id,itemId:id}),z.strictObject({storage:z.literal('local'),localRef:uuid,name:id})]).nullable();
const mutation={...scope,expectedRevision:id,expectedDocumentId:id,expectedTarget:target,operationGeneration:uuid,requestId:uuid,dryRun:z.boolean().default(false)};
const etag={expectedETag:id};
const remoteFile={...mutation,fileRef:uuid,...etag};
const schema={
  microsoftStatus:z.strictObject({...session,requestId:uuid.optional()}),
  microsoftResolve:z.strictObject({...account,target:z.union([
    z.strictObject({sharingUrl:z.string().url().max(4096)}),
    z.strictObject({siteUrl:z.string().url().max(2048)}),
    z.strictObject({siteId:id,driveId:id.optional(),itemId:id.optional()}).refine(v=>!v.itemId||v.driveId,'itemId exige driveId'),
    z.strictObject({driveId:id,itemId:id})
  ]),requestedScope:z.enum(['site','folder','file']),actions:z.array(z.enum(['read','create','open','attach','autosave'])).min(1).max(5).refine(v=>v.includes('read')&&new Set(v).size===v.length,'Incluye read y acciones únicas')}),
  microsoftList:z.strictObject({...scope,kind:z.enum(['libraries','children']),folderRef:uuid.optional(),cursor:uuid.optional(),pageSize:z.number().int().min(1).max(100).default(100),filter:z.literal('folders_and_bpmn').default('folders_and_bpmn')}),
  microsoftCreate:z.strictObject({...mutation,folderRef:uuid,name:z.string().min(1).max(200),attach:z.boolean(),autoSave:z.boolean()}),
  microsoftOpen:z.strictObject({...remoteFile,currentPolicy:z.enum(['require_clean','save_current']).default('require_clean'),autoSave:z.boolean()}),
  microsoftAttach:z.strictObject({...remoteFile,expectedRemoteSha256:z.string().regex(/^[a-f0-9]{64}$/),autoSave:z.boolean()}),
  microsoftAutosave:z.strictObject({...remoteFile,enabled:z.boolean(),waitForSavedMs:z.number().int().min(0).max(5000).default(0)})
};
export const MICROSOFT_FILE_TOOLS=[
  ['naraflows_microsoft_status','microsoftStatus',true,'Estado separado de MCP, Microsoft, documento, destino y autoguardado; consulta recibos por requestId. No conecta ni abre archivos.'],
  ['naraflows_microsoft_resolve','microsoftResolve',true,'Resuelve un enlace Microsoft o IDs exactos dentro de la cuenta activa. Declara solo acciones y alcance explícitamente autorizados por el usuario; no añade permisos ni cambia tenant.'],
  ['naraflows_microsoft_list','microsoftList',true,'Lista bibliotecas de un sitio autorizado o carpetas/BPMN bajo la carpeta resuelta. Usa referencias y cursor opacos de esa sesión; no realiza búsqueda global.'],
  ['naraflows_microsoft_create','microsoftCreate',false,'Crea el documento actual completo en la carpeta explícita, falla si el nombre existe y verifica por relectura. attach y autoSave requieren intención expresa. Devuelve efectos parciales y recibo; nunca repitas a ciegas tras RESULT_UNKNOWN.'],
  ['naraflows_microsoft_open','microsoftOpen',false,'Abre y asocia un BPMN remoto exacto con eTag y revisión. require_clean conserva cambios actuales; save_current exige destino actual autorizado. Nunca descarta borradores ni elige otro destino.'],
  ['naraflows_microsoft_attach','microsoftAttach',false,'Asocia un archivo remoto solo cuando su hash verificado coincide con el documento actual. No importa ni sobrescribe; permite reconciliar una creación ya comprobada.'],
  ['naraflows_microsoft_autosave','microsoftAutosave',false,'Activa o pausa el programador existente sobre el archivo remoto actual exacto. No cambia destino ni borra bloqueos inciertos. La espera opcional es acotada; enabled no equivale a guardado.']
].map(([name,action,readOnly,description])=>({name,action,readOnly,description,schema:schema[action]}));
