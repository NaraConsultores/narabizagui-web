// Read-only evaluation of this synthetic example. Does not contact an editor.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateSnapshot, compareSnapshots } from '../../audit.mjs';

const geometry = new Set(['x','y','width','height','waypoints','labelBounds','routing']);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const semantic = s => s.elements.map(e=>Object.fromEntries(Object.entries(e).filter(([key])=>!geometry.has(key)))).sort((a,b)=>a.id.localeCompare(b.id));
const digest = s => createHash('sha256').update(JSON.stringify(canonical(semantic(s)))).digest('hex');
const activity = e => /Task$/.test(e.type);
const dimensions = s => { const p=s.elements.find(e=>e.id==='Pool_Generic'); return {width:p.width,height:p.height,area:p.width*p.height,aspect:p.width/p.height}; };

export function evaluate(before,after) {
  const checks=[], add=(check,pass)=>checks.push({check,pass});
  const index = new Map(after.elements.map(e=>[e.id,e]));
  add('unique IDs in both snapshots',[before,after].every(s=>new Set(s.elements.map(e=>e.id)).size===s.elements.length));
  add('same IDs, semantic fields, lane responsibility and connection endpoints',same(semantic(before),semantic(after)));
  const tasks=before.elements.filter(activity);
  add('nine activities retain 260x100 and all text/style',tasks.length===9 && tasks.every(e=>{ const n=index.get(e.id);return e.width===260&&e.height===100&&n?.width===e.width&&n?.height===e.height&&same(n.visualStyle,e.visualStyle); }));
  add('same active sheet',before.activeSheetId===after.activeSheetId);
  add('unaffected start, first task and input document retain geometry',['Start_Generic','Task_1','Doc_1'].every(id=>same(before.elements.find(e=>e.id===id),index.get(id))));
  add('two aligned activity columns',new Set(after.elements.filter(activity).map(e=>e.x)).size===2);
  add('right-to-left flow preserves Task_3 -> Task_4',index.get('Flow_4')?.sourceId==='Task_3'&&index.get('Flow_4')?.targetId==='Task_4'&&index.get('Task_3').x>index.get('Task_4').x);
  add('busy role retains one lane and several rows',new Set(after.elements.filter(e=>activity(e)&&e.parentId==='Lane_3').map(e=>e.y)).size===3);
  add('no invented stages, notes or second process',after.elements.filter(e=>e.type==='bpmn:Participant').length===1&&!after.elements.some(e=>['bpmn:TextAnnotation','bpmn:Group'].includes(e.type)));
  add('all figures and external label bounds fit their assigned lane',[before,after].every(s=>{const ix=new Map(s.elements.map(e=>[e.id,e]));return s.elements.filter(e=>ix.get(e.parentId)?.type==='bpmn:Lane').every(e=>{const lane=ix.get(e.parentId);return [e,e.labelBounds].filter(Boolean).every(b=>b.x>=lane.x+30&&b.y>=lane.y&&b.x+b.width<=lane.x+lane.width&&b.y+b.height<=lane.y+lane.height);});}));
  add('all connection segments are orthogonal',[before,after].every(s=>s.elements.filter(e=>e.waypoints).every(e=>e.waypoints.slice(1).every((p,i)=>p.x===e.waypoints[i].x||p.y===e.waypoints[i].y))));
  const audit = s => {const v=validateSnapshot(s,{profile:'review'});return {valid:v.valid,complete:v.complete,errors:v.errors,warnings:v.warnings,issues:v.issues,quality:v.quality};};
  const audits={before:audit(before),after:audit(after)};
  add('static geometry has no errors, warnings or route quality findings',Object.values(audits).every(v=>v.complete&&v.errors===0&&v.warnings===0&&v.quality.totalIssues===0));
  const sizes={before:dimensions(before),after:dimensions(after)};
  return {ok:checks.every(c=>c.pass),checks,semanticSha256:{before:digest(before),after:digest(after)},diff:compareSnapshots(before,after),sizes,changePct:{width:(sizes.after.width/sizes.before.width-1)*100,height:(sizes.after.height/sizes.before.height-1)*100,area:(sizes.after.area/sizes.before.area-1)*100},audits,limits:{synthetic:true,editorConnected:false,mcpRuntimeVerified:false,renderedEditorTextVerified:false,nativeSaveVerified:false,businessApproval:false,decisionCoverage:'No gateways in this example; decision preservation requires a separate case.'}};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [beforeFile,afterFile]=process.argv.slice(2);
  try {
    const before=JSON.parse(await readFile(beforeFile||new URL('before.json',import.meta.url),'utf8'));
    const after=JSON.parse(await readFile(afterFile||new URL('after.json',import.meta.url),'utf8'));
    const result=evaluate(before,after);
    console.log(JSON.stringify(result,null,2));
    if(!result.ok)process.exitCode=2;
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
