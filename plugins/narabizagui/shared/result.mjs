// Normalize MCP and legacy content-only replies without inventing a revision.
export function normalizeResult(value,{toolName='',sessionId,requestId,isError=false}={}){
  const data=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const code=data.code||data.error?.code;
  let outcome='read';
  if(isError||data.error)outcome=code==='RESULT_UNKNOWN'?'unknown':'error';
  else if(data.recoveryRequired||data.reconciliationRequired)outcome='recovery_required';
  else if(data.dryRun&&code!=='BATCH_VALIDATION_FAILED')outcome='preview';
  else if(data.applied===false)outcome=data.rolledBack?'rolled_back':'rejected';
  else if(data.applied===true)outcome='applied';
  else if(data.documentReady===false)outcome='not_ready';
  const ok=['read','applied','preview'].includes(outcome);
  const context={...(data.sessionId||sessionId?{sessionId:data.sessionId||sessionId}:{}),...(data.requestId||requestId?{requestId:data.requestId||requestId}:{})};
  const revision=!['error','unknown','preview','rejected'].includes(outcome)?data.revision||data.state?.revision:undefined;
  const error=['error','unknown'].includes(outcome)?{code:code||'ERROR',message:data.message||data.error?.message||'La herramienta no confirmó el resultado.',...Object.fromEntries(['busyReason','retryable','retryAfterMs','recovery','failedOperation'].filter(k=>data[k]!==undefined).map(k=>[k,data[k]]))}:undefined;
  return{...data,...context,ok,outcome,...(revision?{revision}:{}),...(error?{error}:{}),responseSchema:'visual-quality-v1',...(toolName?{toolName}:{})};
}
export function parseToolResult(reply,context={}){
  let value=reply?.structuredContent;
  if(!value){for(const item of reply?.content||[]){if(item.type!=='text')continue;try{value=JSON.parse(item.text);break;}catch{/* A prose message is not a snapshot. */}}}
  if(!value||typeof value!=='object'||Array.isArray(value))return normalizeResult({code:'INVALID_TOOL_RESPONSE',message:'La herramienta no devolvió un objeto verificable.'},{...context,isError:true});
  return normalizeResult(value,{...context,isError:reply.isError===true});
}
export function confirmedState(result){
  if(!result?.ok||!['read','applied'].includes(result.outcome))throw Object.assign(Error('El resultado no confirma un estado editable.'),{code:'UNCONFIRMED_STATE'});
  const state=result.state||result;
  if(!state.revision||state.documentReady===false)throw Object.assign(Error('Falta una revisión confirmada.'),{code:'UNCONFIRMED_STATE'});
  return{...state,...(result.sessionId?{sessionId:result.sessionId}:{})};
}
// Never blindly resend an unknown edit. A caller may wait or reconcile once.
export function recoveryDecision(result,{attempt=0}={}){
  const code=result?.error?.code||result?.code;
  if(result?.outcome==='unknown'||result?.outcome==='recovery_required')return{action:attempt===0?'read_and_reconcile':'stop',resend:false};
  if(code==='REVISION_CONFLICT')return{action:attempt===0?'read_and_replan':'stop',resend:false};
  if(result?.outcome==='not_ready'||result?.error?.retryable===true)return{action:attempt===0?'wait_then_read':'stop',waitMs:Math.min(5000,Math.max(100,result?.error?.retryAfterMs||500)),resend:false};
  return{action:result?.ok?'continue':'stop',resend:false};
}
