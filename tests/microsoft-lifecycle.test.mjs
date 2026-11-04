import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MicrosoftFiles,MAX_BYTES} from '../microsoft-files.js';
import {MicrosoftWorkspace} from '../scripts/microsoft-workspace.js';
import {MicrosoftFileLifecycle} from '../microsoft-lifecycle.js';
import {MICROSOFT_FILE_TOOLS} from '../plugins/naraflows/shared/microsoft-files.mjs';

export const XML='<?xml version="1.0" encoding="UTF-8"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="QA"><process id="GenericProcess"/></definitions>';
export function fixture(){
  const auth={account:{homeAccountId:'generic-account',localAccountId:'generic-local',tenantId:'generic-tenant'},generation:1,async token(scopes,interactive){assert.equal(interactive,false);return'generic-token';}};
  const nodes=new Map([['root',{id:'root',name:'Library',folder:{},parent:null}],['folder',{id:'folder',name:'QA',folder:{},parent:'root'}],['sibling',{id:'sibling',name:'Sibling',folder:{},parent:'root'}]]),sessions=new Map(),calls=[];
  let counter=0,writes=0,unknown=false,onMetadata=()=>{},onUpload=()=>{};
  const metadata=node=>({id:node.id,name:node.name,eTag:node.tag||'"folder-v1"',size:node.content===undefined?0:Buffer.byteLength(node.content),...(node.folder?{folder:node.folder}:{file:{}}),webUrl:'https://example.sharepoint.com/QA/'+encodeURIComponent(node.name),parentReference:{driveId:'drive',id:node.parent,siteId:'site'},...(node.content===undefined?{}:{'@microsoft.graph.downloadUrl':'https://example.sharepoint.com/download/'+node.id})});
  const fetcher=async(url,options={})=>{
    calls.push({url,method:options.method||'GET',headers:options.headers});const u=new URL(url),p=decodeURIComponent(u.pathname);
    if(p.startsWith('/download/')){assert.equal(options.headers,undefined);return new Response(nodes.get(p.split('/').at(-1)).content);}
    if(p.endsWith('/content')&&options.method==='PUT'){
      assert.equal(u.searchParams.get('@microsoft.graph.conflictBehavior'),'fail');assert.equal(options.headers['If-None-Match'],'*');onUpload();const match=/\/items\/([^:]+):\/(.+):\/content$/.exec(p),session={parent:match[1],name:match[2]};
      if([...nodes.values()].some(n=>n.parent===session.parent&&n.name===session.name))return new Response('',{status:409});
      const node={id:'file-'+(++counter),name:session.name,parent:session.parent,content:options.body,tag:'"v1"'};nodes.set(node.id,node);writes++;
      if(unknown)throw Error('Response lost after commit');return Response.json(metadata(node),{status:201});
    }
    if(p.includes('/shares/'))return Response.json(metadata(nodes.get('folder')));
    if(p.endsWith('/createUploadSession')){const match=/\/items\/([^:]+):\/(.+):\/createUploadSession$/.exec(p);const payload=JSON.parse(options.body);assert.equal(payload.item['@microsoft.graph.conflictBehavior'],'fail');const key=randomUUID();sessions.set(key,{parent:match[1],name:match[2]});return Response.json({uploadUrl:'https://example.sharepoint.com/upload/'+key});}
    if(p.endsWith('/children')){const parent=p.split('/').at(-2);const all=[...nodes.values()].filter(n=>n.parent===parent),top=Number(u.searchParams.get('$top')||100),skip=Number(u.searchParams.get('$skiptoken')||0);return Response.json({value:all.slice(skip,skip+top).map(metadata),...(skip+top<all.length?{'@odata.nextLink':u.origin+u.pathname+'?$skiptoken='+(skip+top)+'&$top='+top}:{})});}
    if(p.endsWith('/drives'))return Response.json({value:[{id:'drive',name:'Library',webUrl:'https://example.sharepoint.com'}]});
    if(p.includes('/sites/'))return Response.json({id:'site',displayName:'Generic site',webUrl:'https://example.sharepoint.com'});
    const key=p.split('/').at(-1),node=nodes.get(key);if(!node)return new Response('',{status:404});onMetadata(node);
    return Response.json(metadata(node));
  };
  const files=new MicrosoftFiles(auth,fetcher),storage=new Map(),workspace=new MicrosoftWorkspace(auth,files,()=>({getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}));
  let state={revision:'r1',documentId:'d1',target:null,handle:null,dirty:true,unappliedProperties:false,uncertain:false,xml:XML,autoSave:{enabled:false,running:false,dirty:true,blocked:null}},locked=false,opens=0;
  const editor={state:()=>({...state,autoSave:{...state.autoSave,dirty:state.dirty}}),prepare:async()=>{if(state.busy)throw Object.assign(Error('Busy'),{code:state.busy});},snapshot:async()=>({xml:state.xml}),lock:()=>{assert.equal(locked,false);locked=true;return()=>{locked=false;};},enableAutoSave:v=>{state.autoSave.enabled=v;},validateSource:async xml=>{if(!xml.includes('<definitions'))throw Object.assign(Error('Invalid XML'),{code:'INVALID_BPMN'});},attach:async(source,guard,enabled)=>{guard();state={...state,xml:source.xml,revision:randomUUID(),documentId:randomUUID(),handle:source.handle,target:{storage:'microsoft',driveId:source.handle.driveId,itemId:source.handle.itemId},dirty:false};editor.enableAutoSave(enabled);},open:async(source,guard,enabled)=>{guard.identity();opens++;await editor.attach(source,guard,enabled);},saveCurrent:async()=>{state.dirty=false;}};
  const service=new MicrosoftFileLifecycle({auth,files,workspace,editor}),sessionId='generic-session';
  const account=async()=>{const s=await service.status({sessionId});return{sessionId,accountRef:s.microsoft.accountRef,expectedTenantId:s.microsoft.tenantId};};
  const resolve=async(target={driveId:'drive',itemId:'folder'},requestedScope='folder',actions=['read','create','open','attach','autosave'])=>service.resolve({...await account(),target,requestedScope,actions});
  const args=async(scope,extra={})=>({...await account(),scopeRef:scope.scopeRef,expectedRevision:state.revision,expectedDocumentId:state.documentId,expectedTarget:state.target,operationGeneration:service.generation,requestId:randomUUID(),dryRun:false,...extra});
  return{service,files,auth,nodes,calls,resolve,args,account,editor,state:()=>state,change:patch=>Object.assign(state,patch),writes:()=>writes,locked:()=>locked,opens:()=>opens,loseResponse:()=>{unknown=true;},onMetadata:fn=>{onMetadata=fn;},onUpload:fn=>{onUpload=fn;},metadata};
}

test('V01: connections are independent and disconnected status causes no Graph traffic',async()=>{
  const f=fixture();f.auth.account=null;const s=await f.service.status({sessionId:'generic-session'});assert.equal(s.microsoft.connected,false);assert.equal(s.document.state,'dirty');assert.equal(f.calls.length,0);await assert.rejects(f.resolve(),{code:'MICROSOFT_CONNECT'});
});
test('V02/V03: resolve link, direct IDs and site; folder scope cannot list sibling libraries',async()=>{
  const f=fixture(),folder=await f.resolve({sharingUrl:'https://example.sharepoint.com/:f:/generic'});assert.equal(folder.itemId,'folder');
  const shortLink=await f.resolve({sharingUrl:'https://1drv.ms/f/s!GenericQA'});assert.equal(shortLink.itemId,'folder');
  await assert.rejects(f.service.list({...await f.args(folder),kind:'libraries',pageSize:100}),{code:'OUT_OF_SCOPE'});
  const site=await f.resolve({siteUrl:'https://example.sharepoint.com'},'site');const libraries=await f.service.list({...await f.args(site),kind:'libraries',pageSize:100});assert.equal(libraries.entries[0].driveId,'drive');
  const libraryChildren=await f.service.list({...await f.args(site),kind:'children',folderRef:libraries.entries[0].folderRef,pageSize:100});assert.equal(libraryChildren.entries.length,2);
  const before=f.calls.length;await assert.rejects(f.resolve({sharingUrl:'https://attacker.invalid/link'}),{code:'INVALID_TARGET'});assert.equal(f.calls.length,before);
});
test('V04: bounded pagination preserves Unicode names, excludes non-BPMN and protects cursors',async()=>{
  const f=fixture();for(let i=0;i<105;i++)f.nodes.set('child-'+i,{id:'child-'+i,name:i===104?'Último proceso.bpmn':'Generic '+i+'.bpmn',parent:'folder',content:XML,tag:'"v1"'});f.nodes.set('text',{id:'text',name:'skip.txt',parent:'folder',content:'generic'});
  const scope=await f.resolve(),base=await f.args(scope,{kind:'children',folderRef:scope.folderRef,pageSize:100});const first=await f.service.list(base);assert.equal(first.entries.length,100);assert.equal(first.complete,false);const last=await f.service.list({...base,cursor:first.nextCursor});assert.equal(last.entries.length,5);assert.equal(last.complete,true);assert.ok(last.entries.some(e=>e.name==='Último proceso.bpmn'));
  assert.ok(!f.calls.some(c=>c.url.includes('/download/')));await assert.rejects(f.service.list({...base,cursor:first.nextCursor,pageSize:1}),{code:'OUT_OF_SCOPE'});
});
test('V05/V07/V16: create, reread, attach and replay use one write and preserve the exact target',async()=>{
  const f=fixture(),scope=await f.resolve(),args=await f.args(scope,{folderRef:scope.folderRef,name:'Generic QA',attach:true,autoSave:true});const result=await f.service.create(args);
  assert.equal(result.phase,'completed');assert.equal(result.created,true);assert.equal(result.verified,true);assert.equal(result.attached,true);assert.equal(result.remote.parentItemId,'folder');assert.match(result.remote.sha256,/^[a-f0-9]{64}$/);assert.equal(result.document.target.itemId,result.remote.itemId);assert.equal(result.autoSave.effective,true);assert.equal(f.state().xml,XML);assert.equal(f.opens(),0);assert.equal(f.locked(),false);
  const again=await f.service.create(args);assert.equal(again.replayed,true);assert.equal(f.writes(),1);await assert.rejects(f.service.create({...args,name:'Other'}),{code:'REQUEST_ID_REUSED'});
});
test('V06: an existing name or a concurrent creator is never overwritten',async()=>{
  const f=fixture(),scope=await f.resolve();f.nodes.set('existing',{id:'existing',name:'Same.bpmn',parent:'folder',content:'original',tag:'"old"'});
  await assert.rejects(f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Same',attach:true,autoSave:true})),{code:'NAME_ALREADY_EXISTS'});assert.equal(f.nodes.get('existing').content,'original');assert.equal(f.writes(),0);
  f.onUpload(()=>{f.nodes.set('racer',{id:'racer',name:'Race.bpmn',parent:'folder',content:'other writer',tag:'"other"'});});await assert.rejects(f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Race',attach:true,autoSave:true})),{code:'NAME_ALREADY_EXISTS'});assert.equal(f.nodes.get('racer').content,'other writer');assert.equal(f.state().target,null);
});
test('V08/V09: unknown write is recorded, not retried; a lost generation cannot execute old arguments',async()=>{
  const f=fixture(),scope=await f.resolve(),args=await f.args(scope,{folderRef:scope.folderRef,name:'Unknown',attach:true,autoSave:true});f.loseResponse();await assert.rejects(f.service.create(args),{code:'SAVE_UNCERTAIN',phase:'result_unknown'});assert.equal(f.writes(),1);await assert.rejects(f.service.create(args),{code:'SAVE_UNCERTAIN'});assert.equal(f.writes(),1);const s=await f.service.status({sessionId:args.sessionId,requestId:args.requestId});assert.equal(s.receipt.phase,'result_unknown');assert.equal(f.state().target,null);
  await assert.rejects(f.service.create({...args,requestId:randomUUID(),operationGeneration:randomUUID()}),{code:'OPERATION_RECEIPT_EXPIRED'});assert.equal(f.writes(),1);
});
test('V10: an edit during upload keeps the user document and returns verified_unattached with exact file',async()=>{
  const f=fixture(),scope=await f.resolve();f.onUpload(()=>f.change({revision:'manual-new',xml:XML+'\n'}));const r=await f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Edited',attach:true,autoSave:true}));assert.equal(r.created,true);assert.equal(r.verified,true);assert.equal(r.attached,false);assert.equal(r.phase,'verified_unattached');assert.equal(r.reconciliationRequired,true);assert.ok(r.remote.itemId);assert.equal(f.state().revision,'manual-new');assert.equal(f.state().target,null);
});
test('V11: account generation and tenant mismatches invalidate references without a write',async()=>{
  const f=fixture(),scope=await f.resolve(),args=await f.args(scope,{folderRef:scope.folderRef,name:'Account',attach:true,autoSave:true});f.auth.generation++;await assert.rejects(f.service.create(args),{code:'ACCOUNT_CHANGED'});assert.equal(f.writes(),0);
  const g=fixture(),s=await g.resolve();await assert.rejects(g.service.create(await g.args(s,{expectedTenantId:'another-tenant',folderRef:s.folderRef,name:'Tenant',attach:true,autoSave:true})),{code:'TENANT_MISMATCH'});assert.equal(g.writes(),0);
});
test('V12/V13/V18: dirty, draft, file dialog and uncertain saves are protected',async()=>{
  for(const condition of ['dirty','unappliedProperties','uncertain','FILE_DIALOG_OPEN']){
    const f=fixture();f.nodes.set('file',{id:'file',name:'Existing.bpmn',parent:'folder',content:XML,tag:'"v1"'});const scope=await f.resolve(),list=await f.service.list({...await f.args(scope),kind:'children',folderRef:scope.folderRef,pageSize:100}),file=list.entries[0];
    f.change(condition==='FILE_DIALOG_OPEN'?{dirty:false,busy:condition}:{dirty:false,[condition]:true});const before=f.state().xml;
    await assert.rejects(f.service.open(await f.args(scope,{fileRef:file.fileRef,expectedETag:file.eTag,currentPolicy:'require_clean',autoSave:true})),{code:({dirty:'DIRTY_DOCUMENT',unappliedProperties:'FORM_PENDING',uncertain:'SAVE_UNCERTAIN',FILE_DIALOG_OPEN:'FILE_DIALOG_OPEN'})[condition]});assert.equal(f.state().xml,before);assert.equal(f.state().target,null);assert.equal(f.opens(),0);
  }
});
test('V14/V19: stable eTag is required across the downloaded bytes',async()=>{
  const f=fixture();f.nodes.set('file',{id:'file',name:'Existing.bpmn',parent:'folder',content:XML,tag:'"v1"'});let reads=0;f.onMetadata(node=>{if(node.id==='file'&&++reads===2)node.tag='"changed"';});const handle=f.files.handle(f.metadata(f.nodes.get('file')),'drive');await assert.rejects(handle.verifiedSource(),{code:'EXTERNAL_CHANGE'});assert.equal(f.writes(),0);
  const g=fixture();g.nodes.set('large',{id:'large',name:'Large.bpmn',parent:'folder',content:'x'.repeat(MAX_BYTES+1),tag:'"v1"'});await assert.rejects(g.files.handle(g.metadata(g.nodes.get('large')),'drive').verifiedSource(),{code:'FILE_TOO_LARGE'});
});
test('V16/V18/V24: create unattached, attach identical bytes, pause and open protected remote source',async()=>{
  const f=fixture(),scope=await f.resolve();const created=await f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Cycle',attach:false,autoSave:false}));assert.equal(created.attached,false);assert.equal(f.state().target,null);
  const attached=await f.service.attach(await f.args(scope,{fileRef:created.fileRef,expectedETag:created.remote.eTag,expectedRemoteSha256:created.remote.sha256,autoSave:true}));assert.equal(attached.attached,true);assert.equal(f.opens(),0);
  const paused=await f.service.autosave(await f.args(scope,{fileRef:created.fileRef,expectedETag:created.remote.eTag,enabled:false,waitForSavedMs:0}));assert.equal(paused.autoSave.enabled,false);assert.equal(f.writes(),1);
  const opened=await f.service.open(await f.args(scope,{fileRef:created.fileRef,expectedETag:created.remote.eTag,currentPolicy:'require_clean',autoSave:true}));assert.equal(opened.attached,true);assert.equal(opened.phase,'completed');assert.equal(f.opens(),1);assert.equal(opened.document.state,'remote_ready');
});
test('V16: attach refuses different content without importing or writing',async()=>{
  const f=fixture(),scope=await f.resolve();const created=await f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Mismatch',attach:false,autoSave:false}));f.change({xml:XML+'\n',revision:'changed'});await assert.rejects(f.service.attach(await f.args(scope,{fileRef:created.fileRef,expectedETag:created.remote.eTag,expectedRemoteSha256:created.remote.sha256,autoSave:true})),{code:'CONTENT_MISMATCH'});assert.equal(f.writes(),1);assert.equal(f.opens(),0);assert.equal(f.state().target,null);
});
test('V22/V23: strict MCP schemas reject hidden URL/token/overwrite fields and expose seven tools',()=>{
  assert.equal(MICROSOFT_FILE_TOOLS.length,7);const schema=MICROSOFT_FILE_TOOLS.find(t=>t.action==='microsoftStatus').schema;assert.equal(schema.safeParse({sessionId:'generic-session',token:'secret'}).success,false);assert.equal(schema.safeParse({sessionId:'generic-session'}).success,true);
});
test('V03: moving a known child out of scope rejects it before listing its contents',async()=>{
  const f=fixture();f.nodes.set('child',{id:'child',name:'Child QA',folder:{},parent:'folder'});const scope=await f.resolve(),listed=await f.service.list({...await f.args(scope),kind:'children',folderRef:scope.folderRef,pageSize:100});f.nodes.get('child').parent='sibling';const before=f.calls.filter(c=>c.url.includes('/children')).length;await assert.rejects(f.service.list({...await f.args(scope),kind:'children',folderRef:listed.entries[0].folderRef,pageSize:100}),{code:'OUT_OF_SCOPE'});assert.equal(f.calls.filter(c=>c.url.includes('/children')).length,before);
});
test('V08: an uncertain creation pauses autosave and blocks a fresh write request',async()=>{
  const f=fixture(),scope=await f.resolve();f.loseResponse();await assert.rejects(f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Unknown',attach:true,autoSave:true})),{code:'SAVE_UNCERTAIN'});assert.equal((await f.service.status({sessionId:'generic-session'})).autoSave.blocked,'RESULT_UNKNOWN');assert.equal(f.state().autoSave.enabled,false);await assert.rejects(f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Other',attach:true,autoSave:true})),{code:'RESULT_UNKNOWN'});assert.equal(f.writes(),1);
});
test('V11: generation change during token acquisition prevents sending the write',async()=>{
  const f=fixture(),scope=await f.resolve();let changing=false;f.onMetadata(()=>{changing=true;});f.auth.token=async()=>{if(changing)f.auth.generation++;return'generic-token';};await assert.rejects(f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Generation',attach:true,autoSave:true})),{code:'ACCOUNT_CHANGED'});assert.equal(f.writes(),0);assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);
});
test('V14/V20: invalid UTF-8 is refused and Graph diagnostics redact URLs',async()=>{
  const f=fixture();f.nodes.set('file',{id:'file',name:'Invalid.bpmn',parent:'folder',content:'xx',tag:'"v1"'});const original=f.files.fetcher;f.files.fetcher=(url,options)=>url.includes('/download/')?new Response(new Uint8Array([0xc0,0xaf])):original(url,options);await assert.rejects(f.files.handle(f.metadata(f.nodes.get('file')),'drive').verifiedSource(),{code:'INVALID_ENCODING'});
  f.files.fetcher=async()=>Response.json({error:{code:'invalidRequest',message:'Invalid location https://example.sharepoint.com/private-value'}},{status:400});await assert.rejects(f.files.request('drives/drive/root'),e=>e.code==='MICROSOFT_ERROR'&&e.message.includes('invalidRequest')&&!e.message.includes('private-value'));
});
test('V13: save_current reopening the same file expects the verified eTag from its own save',async()=>{
 const f=fixture(),scope=await f.resolve(),created=await f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Own save',attach:true,autoSave:false}));
 f.change({dirty:true,xml:XML+'\n'});f.editor.saveCurrent=async()=>{const node=f.nodes.get(created.remote.itemId);node.content=f.state().xml;node.tag='"own-save-v2"';f.state().handle.cache=null;await f.state().handle.getFile();f.change({dirty:false});};
 const opened=await f.service.open(await f.args(scope,{fileRef:created.fileRef,expectedETag:created.remote.eTag,currentPolicy:'save_current',autoSave:true}));assert.equal(opened.currentSaved,true);assert.equal(opened.remote.eTag,'"own-save-v2"');assert.equal(opened.document.dirty,false);
});
test('a scoped create cannot associate or change autosave without those explicit actions',async()=>{
 const f=fixture(),scope=await f.resolve(undefined,'folder',['read','create','attach']);await assert.rejects(f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Scoped',attach:true,autoSave:false})),{code:'OUT_OF_SCOPE'});assert.equal(f.writes(),0);assert.equal(f.state().target,null);
});
test('autosave reports a parallel-tab read-only lock as ineffective',async()=>{
 const f=fixture(),scope=await f.resolve();await f.service.create(await f.args(scope,{folderRef:scope.folderRef,name:'Read-only QA',attach:true,autoSave:true}));f.change({readOnly:true});const status=await f.service.status({sessionId:'generic-session'});assert.equal(status.autoSave.enabled,true);assert.equal(status.autoSave.targetMatches,true);assert.equal(status.autoSave.effective,false);assert.equal(status.autoSave.blocked,'FILE_READ_ONLY');
});
