import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeResult,parseToolResult,confirmedState,recoveryDecision} from '../plugins/naraflows/shared/result.mjs';

test('normal dry-runs are previews, failed prevalidation stays rejected, recovery has one bounded read',()=>{
 assert.equal(normalizeResult({dryRun:true,applied:false}).outcome,'preview');
 assert.equal(normalizeResult({dryRun:true,applied:false,code:'BATCH_VALIDATION_FAILED'}).outcome,'rejected');
 const unknown=normalizeResult({code:'RESULT_UNKNOWN'},{isError:true});assert.equal(recoveryDecision(unknown).action,'read_and_reconcile');assert.equal(recoveryDecision(unknown,{attempt:1}).action,'stop');assert.equal(recoveryDecision(unknown).resend,false);
 const busy=normalizeResult({code:'BUSY',retryable:true,retryAfterMs:9000},{isError:true});assert.equal(recoveryDecision(busy).waitMs,5000);assert.equal(recoveryDecision(busy,{attempt:1}).action,'stop');
 const conflict=normalizeResult({code:'REVISION_CONFLICT'},{isError:true});assert.equal(recoveryDecision(conflict).action,'read_and_replan');
});
test('a compact applied result retains the explicit session and confirmed next revision',()=>{
 const r=normalizeResult({applied:true,state:{revision:'r2',elementsOmitted:true}},{sessionId:'session',requestId:'request'});
 assert.equal(r.outcome,'applied');assert.equal(r.sessionId,'session');assert.equal(r.revision,'r2');assert.equal(confirmedState(r).sessionId,'session');
});
test('a preview and validation rejection cannot be consumed as an applied state',()=>{
 for(const input of [{applied:false,dryRun:true,sourceRevision:'r1'},{applied:false,code:'BATCH_VALIDATION_FAILED'}]){const r=normalizeResult(input);assert.throws(()=>confirmedState(r),{code:'UNCONFIRMED_STATE'});assert.equal(r.revision,undefined);}
});
test('legacy content-only errors and unknown results preserve bounded recovery metadata',()=>{
 const r=parseToolResult({isError:true,content:[{type:'text',text:JSON.stringify({code:'EDITOR_NOT_READY',busyReason:'saving',retryable:true,retryAfterMs:250,recovery:'wait'})}]},{sessionId:'s'});
 assert.equal(r.outcome,'error');assert.equal(r.error.retryAfterMs,250);assert.equal(r.sessionId,'s');assert.equal(r.ok,false);
 const unknown=parseToolResult({isError:true,content:[{type:'text',text:'{"code":"RESULT_UNKNOWN"}'}]});assert.equal(unknown.outcome,'unknown');assert.throws(()=>confirmedState(unknown));
});
test('rollback, recovery and malformed replies have distinct outcomes',()=>{
 assert.equal(normalizeResult({applied:false,rolledBack:true,state:{revision:'after-rollback'}}).outcome,'rolled_back');
 assert.equal(normalizeResult({applied:true,reconciliationRequired:true}).outcome,'recovery_required');
 assert.equal(parseToolResult({content:[{type:'text',text:'Not JSON'}]}).error.code,'INVALID_TOOL_RESPONSE');
});
