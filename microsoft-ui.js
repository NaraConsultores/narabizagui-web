'use strict';
(() => {
  const { auth, files: cloud, workspace } = window.NaraMicrosoft.create();
  if(window.NaraFlowsEditor?.fileAdapter&&window.NaraMicrosoft.FileLifecycle)window.NaraMicrosoftFiles = new window.NaraMicrosoft.FileLifecycle({auth,files:cloud,workspace,editor:window.NaraFlowsEditor.fileAdapter});
  const dialog = byId('microsoftDialog'), list = byId('msFileList');
  let mode = 'open', provider = 'onedrive', folder = null, parents = [], nextLink = null;
  let listingId = 0, busy = false, selected = null, restoring = true, recentView = false, resumeCancelled = false;
  const context = () => ({ provider, siteUrl: provider === 'sharepoint' ? byId('msSiteUrl').value.trim() : undefined });
  const isCloud = () => browserFiles.handle?.storageKind === 'microsoft';
  function message(value, error = false) {
    byId('msMessage').textContent = value; byId('msMessage').classList.toggle('ms-error', error);
  }
  function controls() {
    const connected = Boolean(auth.account);
    byId('msWelcome').hidden = connected; byId('msBrowser').hidden = !connected;
    byId('msAccount').textContent = auth.account?.username || '';
    byId('connectMicrosoft').textContent = restoring ? 'Recuperando Microsoft…' : connected ? 'Microsoft conectado' : 'Conectar Microsoft';
    byId('connectMicrosoft').disabled = restoring;
    for (const key of ['msConnect','msSwitch','msDisconnect','msDisconnectAll','msOneDrive','msSharePointTab','msRecent','msClearRecent','msSiteOpen','msFileName']) byId(key).disabled = busy;
    byId('msClose').disabled = byId('msCancel').disabled = saving;
    byId('msUp').disabled = busy || recentView || !parents.length;
    byId('msMore').hidden = !nextLink; byId('msMore').disabled = busy;
    byId('msSave').hidden = !connected || mode !== 'save';
    byId('msSave').disabled = busy || !folder || !byId('msFileName').value.trim();
    byId('msOpen').hidden = !connected || mode !== 'open' || recentView;
    byId('msOpen').disabled = busy || !selected;
    byId('msSaveFields').hidden = mode !== 'save';
    byId('msSharePointTab').hidden = auth.account?.tenantId === '9188040d-6c67-4c5b-b112-36a304b66dad';
    byId('msOneDrive').setAttribute('aria-pressed', String(!recentView && provider === 'onedrive'));
    byId('msSharePointTab').setAttribute('aria-pressed', String(!recentView && provider === 'sharepoint'));
    byId('msRecent').setAttribute('aria-pressed', String(recentView));
    byId('msRecent').hidden = mode !== 'open'; byId('msClearRecent').hidden = !recentView;
    byId('msSiteForm').hidden = recentView || provider !== 'sharepoint';
    list.setAttribute('aria-busy', String(busy));
    for (const button of list.querySelectorAll('button')) button.disabled = busy || (mode === 'save' && button.dataset.kind === 'file');
    window.NaraWorkspaceUI?.refreshMicrosoft();
  }
  async function run(action, pending = 'Cargando…') {
    if (busy) return; busy = true; controls(); message(pending);
    try { await action(); }
    catch (error) { message(error.errorCode === 'user_cancelled' ? 'Conexión cancelada.' : error.message, true); }
    finally { busy = false; controls(); }
  }
  function reset() {
    listingId++; folder = null; parents = []; nextLink = null; selected = null;
    list.replaceChildren(); byId('msPath').replaceChildren();
  }
  function detachCloud() {
    if (!isCloud()) return;
    if(browserFiles.detach)browserFiles.detach();else browserFiles.handle = null; browserFiles.hash = null;
    browserFileContext(browserFiles.name); setDirty(true);
    status('La conexión al archivo se cerró. El diagrama sigue abierto como copia sin guardar.');
  }
  function open(which = 'open') {
    resumeCancelled = true;
    if (restoring) return status('Espera a que termine la recuperación de Microsoft.');
    if (window.NaraMicrosoftOperation || busy || saving || loadingDiagram || filePolling || !ready) return status('Espera a que termine la operación del archivo.');
    if (window.NaraPropertyDraftPending()) return status('Aplica o descarta el texto de Propiedades antes de abrir Microsoft.');
    reset(); mode = which; provider = 'onedrive'; recentView = false;
    byId('msFileName').value = browserFiles.name;
    byId('msHeading').textContent = which === 'save' ? 'Guardar en Microsoft' : 'Abrir desde Microsoft';
    byId('msAccountMenu').open = false;
    window.NaraMicrosoftDialogOpen = true; controls(); dialog.showModal();
    message('');
    if (auth.account) run(rememberedFolder);
    else byId('msConnect').focus();
  }
  function close() { if (!saving) dialog.close(); }
  function crumbs() {
    const path = byId('msPath'); path.replaceChildren();
    const chain = [...parents, folder].filter(Boolean);
    chain.forEach((item, index) => {
      if (index) { const slash = document.createElement('span'); slash.textContent = '/'; slash.setAttribute('aria-hidden','true'); path.append(slash); }
      const current = index === chain.length - 1;
      const node = document.createElement(current ? 'span' : 'button'); node.textContent = item.name;
      if (current) node.setAttribute('aria-current','location');
      else node.onclick = () => { if (!busy) run(() => showFolder(item, { trail: chain.slice(0,index) })); };
      path.append(node);
    });
  }
  function row(item, kind, action, direct = false) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ms-file'; button.dataset.kind = kind;
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg'); icon.classList.add('ms-file-icon'); icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('width','21'); icon.setAttribute('height','21'); icon.setAttribute('aria-hidden','true');
    const outline = document.createElementNS('http://www.w3.org/2000/svg','path'); outline.setAttribute('d',kind === 'folder' ? 'M3 7V5h7l2 3h9v12H3V7Z' : 'M6 3h8l5 5v13H6V3Zm8 0v6h5M9 13h7M9 17h7'); outline.setAttribute('fill','none'); outline.setAttribute('stroke','currentColor'); outline.setAttribute('stroke-width','1.5'); outline.setAttribute('stroke-linejoin','round'); icon.append(outline);
    const name = document.createElement('span'); name.textContent = item.name;
    const type = document.createElement('small'); type.textContent = kind === 'folder' ? 'Carpeta' : 'BPMN';
    button.append(icon,name,type); list.append(button);
    if (kind === 'folder') button.onclick = () => run(action);
    else if (direct) button.onclick = () => run(() => openItem(item), 'Abriendo BPMN…');
    else {
      button.setAttribute('aria-pressed','false');
      button.onclick = () => {
        if (busy) return; selected = item;
        for (const node of list.querySelectorAll('[aria-pressed]')) node.setAttribute('aria-pressed',String(node === button));
        message('Archivo seleccionado. Pulsa Abrir para continuar.'); controls();
      };
      button.ondblclick = () => run(openSelected);
    }
  }
  async function showFolder(next, { trail = folder ? [...parents, folder] : [], more = false } = {}) {
    const current = ++listingId, account = cloud.accountId();
    const result = await cloud.children(next, more ? nextLink : null);
    if (!dialog.open || current !== listingId) return;
    cloud.assertAccount(account);
    if (!more) { parents = trail; folder = next; selected = null; list.replaceChildren(); }
    nextLink = result['@odata.nextLink'] || null;
    for (const item of result.value.sort((a,b) => Number(Boolean(b.folder))-Number(Boolean(a.folder)) || a.name.localeCompare(b.name))) {
      if (item.folder) row(item, 'folder', () => showFolder({ ...item, driveId: next.driveId }));
      else if (/\.bpmn$/i.test(item.name)) row({ ...item, driveId: next.driveId }, 'file');
    }
    crumbs();
    workspace.rememberFolder({ ...folder, ...context() });
    message(list.childElementCount ? (mode === 'open' ? 'Selecciona un BPMN o abre una carpeta.' : 'Elige una carpeta y escribe el nombre de la copia.') : 'Esta carpeta no contiene archivos BPMN ni subcarpetas.');
  }
  async function oneDrive() {
    reset(); provider = 'onedrive'; recentView = false; controls();
    const root = await cloud.root(); root.name = 'OneDrive';
    await showFolder(root, { trail: [] });
  }
  async function rememberedFolder() {
    const saved = workspace.read().folder;
    if (!saved) return oneDrive();
    const current = ++listingId;
    try {
      const recovered = await workspace.folder(saved);
      if (!dialog.open || current !== listingId) return;
      provider = recovered.provider; recentView = false; byId('msSiteUrl').value = recovered.siteUrl; controls();
      await showFolder(recovered.folder, { trail: recovered.parents });
    } catch (error) {
      if (!dialog.open || current !== listingId) return;
      if (!['FILE_NOT_FOUND','MICROSOFT_PERMISSION','INVALID_TARGET'].includes(error.code)) throw error;
      await oneDrive(); message('La carpeta anterior ya no está disponible. Mostramos OneDrive.');
    }
  }
  function recentFiles() {
    reset(); recentView = true;
    const title = document.createElement('span'); title.textContent = 'Recientes'; byId('msPath').append(title);
    const recent = workspace.read().recent;
    for (const file of recent) row(file, 'file', null, true);
    message(recent.length ? 'Pulsa un archivo para abrir su versión actual desde Microsoft.' : 'Aquí aparecerán los BPMN que abras o guardes en Microsoft.');
    controls();
  }
  async function connect() {
    const previous = auth.account?.homeAccountId;
    await auth.connect();
    if (previous && previous !== auth.account.homeAccountId) await detachCloud();
    byId('msAccountMenu').open = false;
    if (dialog.open) await rememberedFolder();
  }
  async function openSelected() {
    if (!selected || mode !== 'open') return;
    return openItem({ ...selected, ...context() });
  }
  async function openItem(item) {
    if (window.NaraPropertyDraftPending()) throw new Error('Aplica o descarta el texto de Propiedades antes de abrir el archivo.');
    if (dirty && !confirm('Hay cambios sin guardar. ¿Abrir el archivo de Microsoft y descartar esos cambios?')) return;
    const current = listingId, version = browserDocumentVersion, sequence = editSequence, accountStamp = workspace.stamp();
    try {
      const { source, stamp } = await workspace.source(item);
      const canApply = () => {
        workspace.assert(stamp);
        return dialog.open && current === listingId && version === browserDocumentVersion && sequence === editSequence && !window.NaraPropertyDraftPending();
      };
      if (!canApply() || await acceptBrowserSource(source, canApply) === false) throw new Error('El diagrama cambió mientras se abría el archivo. Tus cambios siguen abiertos; vuelve a intentar.');
      try { workspace.assert(stamp); } catch (error) { detachCloud(); throw error; }
      const remembered = workspace.rememberFile(source.handle, item);
      dialog.close();
      status('BPMN abierto desde Microsoft.' + (remembered ? ' Se retomará al volver a entrar.' : ' El navegador no permite recordar este archivo.'));
    } catch (error) {
      if (['FILE_NOT_FOUND','MICROSOFT_PERMISSION'].includes(error.code)) { workspace.removeFile(item, accountStamp); if (recentView) recentFiles(); }
      throw error;
    }
  }
  byId('connectMicrosoft').onclick = () => open();
  byId('openMicrosoft').onclick = () => open();
  byId('saveMicrosoftAs').onclick = () => open('save');
  byId('msClose').onclick = byId('msCancel').onclick = close;
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => { reset(); window.NaraMicrosoftDialogOpen = false; });
  byId('msConnect').onclick = byId('msSwitch').onclick = () => run(connect, 'Conectando con Microsoft…');
  byId('msDisconnect').onclick = () => run(async () => {
    workspace.clearCurrent?.();
    await auth.disconnect(); reset(); byId('msAccountMenu').open = false; message('Cuenta desconectada en esta pestaña.');
  });
  byId('msDisconnectAll').onclick = () => run(async () => { workspace.clearCurrent?.();await auth.disconnect({all:true});reset();byId('msAccountMenu').open=false;message('Conexiones cerradas en todas las pestañas de esta aplicación.'); });
  byId('msOneDrive').onclick = () => run(oneDrive);
  byId('msRecent').onclick = () => { if (!busy) recentFiles(); };
  byId('msClearRecent').onclick = () => { if (!busy) { workspace.clearRecent(); recentFiles(); } };
  byId('msSharePointTab').onclick = () => {
    if (busy) return; reset(); provider = 'sharepoint'; recentView = false; controls(); message('Introduce la dirección del sitio de tu equipo.'); byId('msSiteUrl').focus();
  };
  byId('msSiteForm').onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const current = ++listingId, account = cloud.accountId(), drives = await cloud.siteDrives(byId('msSiteUrl').value.trim(), { authorize: true });
      if (!dialog.open || current !== listingId) return;
      cloud.assertAccount(account); reset();
      for (const drive of drives) row(drive,'folder', async () => { const root = await cloud.root(drive.id); root.name = drive.name; await showFolder(root,{trail:[]}); });
      message(drives.length ? 'Elige una biblioteca de documentos.' : 'No se encontraron bibliotecas disponibles en este sitio.');
    }, 'Conectando con el sitio…');
  };
  byId('msUp').onclick = () => run(() => showFolder(parents.at(-1), { trail: parents.slice(0,-1) }));
  byId('msMore').onclick = () => run(() => showFolder(folder, { more: true }));
  byId('msOpen').onclick = () => run(openSelected, 'Abriendo BPMN…');
  byId('msFileName').oninput = controls;
  byId('msFileName').onkeydown = event => { if (event.key === 'Enter' && !byId('msSave').disabled) { event.preventDefault(); byId('msSave').click(); } };
  byId('msSave').onclick = () => run(async () => {
    if (!folder || mode !== 'save') return;
    if (window.NaraPropertyDraftPending()) throw new Error('Aplica los cambios de Propiedades antes de guardar.');
    saving = true; controls(); const sequence = editSequence, account = cloud.accountId();
    try {
      const { xml } = await modeler.saveXML({ format: true }); browserFiles.validate(xml);
      const {handle} = await cloud.createExclusive(folder, byId('msFileName').value, xml, {beforeWrite:()=>cloud.assertAccount(account)});
      cloud.assertAccount(account);
      await browserFiles.attach({ handle, name: handle.name, xml }); browserFileContext(handle.name);
      try { cloud.assertAccount(account); } catch (error) { detachCloud(); throw error; }
      workspace.rememberFile(handle, context());
      if (sequence === editSequence) setDirty(false);
      byId('externalChange').hidden = true; dialog.close(); status('BPMN guardado en Microsoft · Contenido comprobado.');
    } finally { saving = false; window.naraAutoSave?.refresh(); }
  }, 'Guardando y comprobando…');
  window.NaraMicrosoftUI = { clearCurrent:()=>workspace.clearCurrent(),accountName:()=>auth.account?.username||'',restoring:()=>restoring,saveAs: () => open('save'), open, recents:()=>{open();if(dialog.open&&auth.account)recentFiles();},
    navigation:()=>({connected:Boolean(auth.account),busy,favorites:workspace.favorites(),canFavorite:!busy&&Boolean(folder)&&!recentView,isFavorite:Boolean(folder&&workspace.favorites().some(value=>value.id===folder.id&&value.driveId===folder.driveId))}),
    toggleFavorite:()=>{if(!busy&&folder)workspace.toggleFavorite({...folder,...context()});window.NaraWorkspaceUI?.refreshMicrosoft();},
    openFavorite:index=>{const value=workspace.favorites()[index];if(!value||busy)return;provider=value.provider;byId('msSiteUrl').value=value.siteUrl||'';recentView=false;run(()=>showFolder(value,{trail:[]}));},
    location:()=>{const last=workspace.read().last,handle=browserFiles.handle;if(handle?.storageKind!=='microsoft')return'Microsoft';const provider=last?.id===handle.itemId&&last.provider==='sharepoint'?'SharePoint':'OneDrive';const path=handle.parent?.path?.split('root:')[1];return provider+(path?' · '+path:handle.parent?.name?' · '+handle.parent.name:'');},
    versions:async(nextLink=null)=>{const handle=browserFiles.handle;if(handle?.storageKind!=='microsoft')throw Error('El archivo actual no está en Microsoft.');const result=await cloud.versions(handle,nextLink);if(browserFiles.handle!==handle)throw Error('El archivo cambió durante la consulta. Abre de nuevo su información.');return result;}
  };
  // Without a popup, sign-in continues in this tab. The open diagram and the
  // dialog survive the round trip through a snapshot kept in this tab only.
  const redirectKey = 'narabizagui.microsoft.redirect.v1';
  auth.redirectFallback = async redirect => {
    if (saving || window.NaraPropertyDraftPending()) return false;
    try {
      const snapshot = { mode: dialog.open ? mode : null };
      if (dirty) Object.assign(snapshot, { name: browserFiles.name, xml: (await modeler.saveXML({ format: true })).xml });
      sessionStorage.setItem(redirectKey, JSON.stringify(snapshot));
    } catch { return false; }
    window.NaraMicrosoftRedirect = true;
    try { await redirect(); }
    catch (error) { window.NaraMicrosoftRedirect = false; try { sessionStorage.removeItem(redirectKey); } catch {} throw error; }
    return true;
  };
  async function restoreRedirect() {
    let snapshot;
    try { snapshot = JSON.parse(sessionStorage.getItem(redirectKey) || 'null'); sessionStorage.removeItem(redirectKey); } catch { return null; }
    if (snapshot?.xml) {
      // Keep the reopened file as the saved base so autosave resumes the pending edits.
      const handle = browserFiles.handle && browserFiles.name === snapshot.name ? browserFiles.handle : null;
      const base = handle ? { name: snapshot.name, xml: browserFiles.baseXml, hash: browserFiles.hash, handle } : { name: snapshot.name, xml: snapshot.xml, handle: null };
      if (await acceptBrowserSource({ name: snapshot.name, xml: snapshot.xml, handle }, () => true, false, base) !== false) setDirty(true);
    }
    return snapshot;
  }
  auth.onChange(({ previous, account, reason }) => {
    if (previous && previous !== account) detachCloud();
    reset(); controls();
    if (dialog.open && !account) message(reason === 'expired' ? 'Microsoft requiere iniciar sesión de nuevo. Tu diagrama sigue abierto.' : 'La conexión se cerró o cambió en este navegador. Tu diagrama sigue abierto.');
  });
  Promise.all([auth.initialized, window.NaraStartup]).then(async () => {
    // An explicit new-document link must never resume an existing cloud file.
    if(new URLSearchParams(location.search).get('nuevo')==='1'){
      workspace.clearCurrent?.();
      if(typeof history!=='undefined'){const params=new URLSearchParams(location.search);params.delete('nuevo');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);}
      return;
    }
    const canApply = () => !resumeCancelled && auth.account && window.projectReady && standalone && ready && !dirty && !saving && !loadingDiagram && !filePolling && !browserFiles.handle && browserDocumentVersion === window.NaraInitialDocumentVersion && !window.NaraPropertyDraftPending();
    const last = workspace.currentFile?.(), stamp = workspace.stamp();
    let recoveredHandle = null;
    try {
      const recovered = await workspace.resume(canApply, async (source, guard) => {
        const applied = await acceptBrowserSource(source, guard);
        if (applied !== false) recoveredHandle = source.handle;
        return applied;
      });
      if (recovered) status('Archivo de esta pestaña recuperado desde Microsoft.');
    } catch (error) {
      if (error.code === 'ACCOUNT_CHANGED') { if (recoveredHandle && browserFiles.handle === recoveredHandle) detachCloud(); return; }
      if (last && ['FILE_NOT_FOUND','MICROSOFT_PERMISSION','INVALID_TARGET'].includes(error.code)) workspace.removeFile(last, stamp);
      status('No se pudo retomar el último BPMN. Puedes abrir otro desde Microsoft. ' + error.message);
    }
  }).catch(() => message('No se pudo preparar Microsoft. Conserva tu BPMN y recarga la página.',true))
    .then(restoreRedirect).catch(error => { status('No se pudo recuperar el diagrama tras iniciar sesión. ' + error.message); return null; })
    .then(snapshot => {
      restoring = false; controls();
      if (!auth.redirected) return;
      status('Cuenta Microsoft conectada.');
      if (snapshot?.mode && auth.account) open(snapshot.mode);
    });
  controls();
})();
