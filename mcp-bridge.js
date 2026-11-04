'use strict';
(() => {
  const button = document.getElementById('connectCodex');
  const dialog = document.getElementById('codexDialog');
  const input = document.getElementById('codexCode');
  const message = document.getElementById('codexMessage');
  const connect = document.getElementById('codexPair');
  const disconnect = document.getElementById('codexDisconnect');
  let live = null;
  let pairing = false;
  let pendingSession=null;
  let reconnecting = false;
  let contractNotice='';
  const storageKey = 'narabizagui.codex.session.v1';
  function remember(session) {
    try {
      if (session) sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, port: session.port, id: session.id, token: session.token,ownership:session.ownership,generation:session.generation,serverVersion:session.serverVersion,toolContract:session.toolContract }));
      else sessionStorage.removeItem(storageKey);
    } catch { /* The live connection still works when tab storage is unavailable. */ }
  }
  async function own(session) {
    if(session.controller.signal.aborted)return false;
    if(!window.NaraTabOwnership)return true;
    session.lease=await window.NaraTabOwnership.claim('mcp:'+session.id);
    if(session.controller.signal.aborted){session.lease?.release();return false;}
    if(session.lease)return true;
    remember(null);say('Esta conexión pertenece a otra pestaña. Solicita un código nuevo para vincular esta copia.');return false;
  }
  async function restore() {
    if (live || pairing || input.value.trim()) return;
    let restoringSession;
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (!stored) return;
      if (stored.version !== 1 || !Number.isInteger(stored.port) || stored.port < 1 || stored.port > 65535 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored.id) || !/^[A-Za-z0-9_-]{43}$/.test(stored.token)) { remember(null); return; }
      const session={...stored,controller:new AbortController()};restoringSession=session;pendingSession=session;
      pairing=true;
      if(!await own(session))return;
      if(session.ownership){const resumed=await send(session,`/sessions/${session.id}/resume`,{});session.token=resumed.sessionToken;session.generation=resumed.generation;remember(session);}
      if(session.controller.signal.aborted)return;
      live = session;pendingSession=null;
      reconnecting = true; render(); say('Restableciendo el vínculo de esta pestaña con el MCP local.');
      loop(live);
    } catch { restoringSession?.lease?.release();if(!restoringSession?.controller.signal.aborted)remember(null);say('No se pudo restablecer el vínculo. Solicita otro código para esta pestaña.'); }
    finally{pairing=false;render();}
  }
  const say = text => { message.textContent = text; };
  window.NaraMcpConnectionInfo=()=>live?{serverVersion:live.serverVersion||'unknown',toolContract:live.toolContract||'legacy',compatible:live.toolContract===(window.NaraModelAudit?.TOOL_CONTRACT||'visual-quality-v1'),recovery:'Comprueba las herramientas cargadas; si conservan el contrato anterior, una conversación nueva carga el plugin actualizado.'}:null;
  function updateContract(session,result){
    session.serverVersion=result.serverVersion||result.version||session.serverVersion;session.toolContract=result.toolContract||session.toolContract;remember(session);
    const key=(session.serverVersion||'unknown')+':'+(session.toolContract||'legacy');
    if(contractNotice===key)return;contractNotice=key;
    if(!window.NaraMcpConnectionInfo()?.compatible)say('Esta conexión usa herramientas anteriores. Para matrices y cambios estructurales abre una conversación nueva con el plugin actualizado. El documento y las operaciones ya disponibles se conservan.');
  }
  const activity=(state,message)=>{if(typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('nara:agent-status',{detail:{state,message}}));};
  function render() {
    button.textContent = live ? reconnecting ? 'Reconectando con Codex' : 'Codex conectado' : 'Conectar con Codex';
    button.classList.toggle('codex-connected', Boolean(live) && !reconnecting);
    input.disabled = Boolean(live) || pairing;
    connect.hidden = Boolean(live);
    connect.disabled = pairing;
    disconnect.hidden = !live;
    activity(live?reconnecting?'reconectando':'conectado':'desconectado');
  }
  async function send(session, path, data, limit = 22000) {
    const response = await fetch(`http://127.0.0.1:${session.port}${path}`, { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}) }, body: JSON.stringify({...data,...(session.generation?{generation:session.generation}:{})}), signal: AbortSignal.any([session.controller.signal, AbortSignal.timeout(limit)]) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'El puente rechazó la solicitud.'), { status: response.status });
    return result;
  }
  async function loop(session) {
    let failures = 0;
    while (live === session) {
      try {
        const response = await send(session, `/sessions/${session.id}/poll`, { name: document.getElementById('diagramTitle').textContent,documentId:window.NaraDocumentIdentity?.() });
        updateContract(session,response);
        failures = 0;
        if (live === session && reconnecting) { reconnecting = false; render(); if(window.NaraMcpConnectionInfo()?.compatible)say('Vínculo restablecido con el MCP local.'); }
        if (live !== session || !response.command) continue;
        const command = response.command;
        let result;
        try {
          if (command.deadline <= Date.now()) throw Object.assign(new Error('El comando venció antes de ejecutarse.'), { code: 'EXPIRED' });
          if (!['read', 'edit', 'save', 'exportPng', 'validate', 'editBatch','microsoftStatus','microsoftResolve','microsoftList','microsoftCreate','microsoftOpen','microsoftAttach','microsoftAutosave'].includes(command.action)) throw new Error('Comando no admitido.');
          if(command.args.expectedDocumentId&&command.args.expectedDocumentId!==window.NaraDocumentIdentity?.())throw Object.assign(new Error('El archivo de esta pestaña cambió. Lee el documento correcto antes de continuar.'),{code:'DOCUMENT_MISMATCH'});
          activity('trabajando',({read:'Leyendo la hoja activa',edit:'Actualizando la hoja activa',save:'Guardando el archivo',exportPng:'Preparando una imagen PNG',validate:'Revisando el modelo',editBatch:'Aplicando un bloque de cambios',microsoftStatus:'Consultando conexiones y archivo',microsoftResolve:'Resolviendo el destino Microsoft',microsoftList:'Consultando la carpeta Microsoft',microsoftCreate:'Creando y comprobando el archivo Microsoft',microsoftOpen:'Abriendo el archivo Microsoft',microsoftAttach:'Asociando el archivo verificado',microsoftAutosave:'Comprobando el autoguardado'})[command.action]);
          result = { commandId: command.id, result: await window.NaraFlowsEditor[command.action](command.args) };
        } catch (error) { result = { commandId: command.id, error: { code: error.code || 'EDITOR_ERROR', message: error.message,...Object.fromEntries(['busyReason','retryable','retryAfterMs','recovery','phase','requestId','created','verified','attached','remote','currentSaved','currentSavedRemote','failedOperation'].filter(key=>error[key]!==undefined).map(key=>[key,error[key]])) } }; }
        activity('conectado',result.error?'La acción necesita revisión: '+result.error.message:'Acción terminada y confirmada por el editor.');
        // Retry only delivery of the result, never execution of an edit or save.
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await send(session, `/sessions/${session.id}/result`, result); break; }
          catch (error) { if (error.status === 409) break; if (attempt === 2) throw error; }
        }
      } catch (error) {
        if (live !== session) return;
        if ([401, 410].includes(error.status)) {
          live = null; reconnecting = false; remember(null); session.lease?.release();session.controller.abort(); render();
          say('El MCP local ya no reconoce este vínculo. Tu diagrama conserva sus cambios. Solicita otro código para vincularlo nuevamente.');
          return;
        }
        failures++;
        reconnecting = true; render();
        say('El puente no responde. Comprobando de nuevo; el diagrama sigue abierto.');
        await new Promise(resolve => setTimeout(resolve, Math.min(15000, 1000 * 2 ** Math.min(failures - 1, 4))));
      }
    }
  }
  button.onclick = () => { render(); dialog.showModal(); input.focus(); };
  document.getElementById('codexClose').onclick = () => dialog.close();
  document.getElementById('codexForm').onsubmit = async event => {
    event.preventDefault();
    if (live || pairing) return;
    const match = /^(\d{1,5})\.([A-Za-z0-9_-]{43})$/.exec(input.value.trim());
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) { say('Pega el código completo que te proporciona Codex.'); return; }
    const session = { port: Number(match[1]), controller: new AbortController() };pendingSession=session;
    pairing = true; render(); say('Vinculando esta pestaña. Autoriza el acceso local si el navegador lo solicita.');
    try {
      const result = await send(session, '/pair', { code: match[2], name: document.getElementById('diagramTitle').textContent }, 15000);
      session.id = result.sessionId; session.token = result.sessionToken;session.ownership=result.ownership;session.generation=result.generation;
      if(!await own(session))return;
      live = session;pendingSession=null; reconnecting = false;
      remember(session);
      input.value = '';
      say('Esta pestaña está vinculada. Codex puede consultar y editar su diagrama. Puedes desconectarla cuando quieras.');
      contractNotice='';updateContract(session,result);
      loop(session);
    } catch (error) {
      session.controller.abort();
      say(error.status ? error.message : 'No se pudo conectar. Comprueba que el plugin está activo y que permitiste el acceso local del navegador. Después solicita un código nuevo.');
    } finally { pairing = false; render(); }
  };
  disconnect.onclick = async () => {
    const session = live;
    if (!session) return;
    live = null; reconnecting = false; remember(null); render();
    try { await send(session, `/sessions/${session.id}/disconnect`, {}, 3000); } catch { /* Local revocation still ends this browser connection. */ }
    session.lease?.release();session.controller.abort();
    say('Pestaña desconectada. El diagrama y sus cambios siguen disponibles.');
  };
  // Reloading closes the pending poll, but keeps this tab's explicit authorization.
  window.addEventListener('pagehide', () => { const session = live||pendingSession;live=null;pendingSession=null;session?.controller.abort();session?.lease?.release(); });
  window.addEventListener('pageshow', event => { if (event.persisted) restore(); });
  const fragment = new URLSearchParams(location.hash.slice(1));
  const code = fragment.get('mcp');
  if (code) {
    fragment.delete('mcp');
    history.replaceState(null, '', location.pathname + location.search + (fragment.size ? '#' + fragment : ''));
    input.value = code; dialog.showModal();
    say('Pulsa Vincular para conectar esta pestaña con tu plugin local de NaraFlows.');
  } else restore();
})();
