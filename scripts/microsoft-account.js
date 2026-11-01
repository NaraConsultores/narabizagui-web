import { FILE_SCOPES, problem } from '../microsoft-files.js';

const identity = account => account ? JSON.stringify([account.homeAccountId, account.localAccountId, account.tenantId]) : null;
const selectionKey = 'narabizagui.microsoft.account.v1';
const logoutKey = 'narabizagui.microsoft.logout.v1';
const reference = account => account && ['homeAccountId','localAccountId','tenantId'].every(k=>typeof account[k]==='string'&&account[k].length>0&&account[k].length<=1024) ? { homeAccountId: account.homeAccountId, localAccountId: account.localAccountId, tenantId: account.tenantId } : null;

// MSAL owns the shared token cache; only the selected identity belongs to a tab.
export class MicrosoftAccount {
  constructor(client, { interactionRequired, popupBlocked = () => false, accountChanged, storage = () => window.sessionStorage, events = globalThis.window }) {
    this.client = client; this.storage = storage; this.events = events; this.interactionRequired = interactionRequired; this.popupBlocked = popupBlocked;
    this.account = null; this.generation = 0; this.listeners = new Set();
    this.redirectFallback = null; this.redirected = false;
    this.selection = this.readSelection();
    if (events) events.addEventListener('storage', event => {
      if (event.key === logoutKey) { this.generation++; this.select(null); this.update(null, 'disconnected'); }
    });
    this.clientReady = client.initialize();
    this.initialized = this.clientReady.then(async () => {
      client.enableAccountStorageEvents?.();
      client.addEventCallback(() => this.synchronize(), [accountChanged]);
      // A sign-in completed in this tab by redirect returns here before any restore.
      const returned = await client.handleRedirectPromise?.().catch(() => null);
      if (returned?.account) {
        this.redirected = true; this.select(returned.account); this.update(returned.account, 'connected');
        client.setActiveAccount(returned.account);
        return;
      }
      await this.restore();
    });
  }
  readSelection() {
    let value;try{value=this.storage().getItem(selectionKey);}catch{return undefined;}
    if(value==null)return undefined;
    try{return reference(JSON.parse(value));}catch{return null;}
  }
  select(account) {
    this.selection = reference(account);
    try { this.storage().setItem(selectionKey, JSON.stringify(this.selection)); } catch { /* Selection remains local to this instance. */ }
  }
  cached(selected) {
    if (!selected) return null;
    if (this.client.getAccount) {const account=this.client.getAccount(reference(selected));return identity(account)===identity(selected)?account:null;}
    return (this.client.getAllAccounts?.() || [this.client.getActiveAccount()]).find(a => identity(a) === identity(selected)) || null;
  }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  update(account, reason) {
    if (identity(this.account) === identity(account)) return;
    const previous = this.account; this.account = account; this.generation++;
    for (const listener of this.listeners) listener({ previous, account, reason });
  }
  synchronize() {
    if (this.account && !this.cached(this.account)) { this.select(null); this.update(null, 'removed'); }
  }
  async restore() {
    // Existing users retain SSO. A new tab never inherits another tab's file.
    const account = this.selection === undefined ? this.client.getActiveAccount() : this.cached(this.selection);
    const generation = this.generation;
    if (!account) return;
    try {
      const result = await this.client.acquireTokenSilent({ scopes: FILE_SCOPES, account });
      if (generation === this.generation && this.cached(account) && identity(result.account) === identity(account)) { this.select(result.account); this.update(result.account, 'restored'); }
    } catch { /* Startup never opens a popup. */ }
  }
  async interact(popup, redirect) {
    try { return await popup(); }
    catch (error) {
      if (!this.popupBlocked(error)) throw error;
      // Embedded browsers and popup blockers may refuse the window. The editor
      // then continues in this tab after preserving its state.
      if (!await this.redirectFallback?.(redirect)) throw problem('MICROSOFT_POPUP_BLOCKED', 'El navegador bloqueó la ventana de Microsoft. Termina la edición o el guardado en curso y vuelve a intentar.');
      return new Promise(() => {}); // The page is navigating to Microsoft.
    }
  }
  async connect() {
    await this.initialized;
    const generation = this.generation, request = { scopes: FILE_SCOPES, prompt: 'select_account' };
    const result = await this.interact(() => this.client.loginPopup(request), () => this.client.loginRedirect(request));
    if (generation !== this.generation) throw problem('ACCOUNT_CHANGED', 'La conexión cambió durante el inicio de sesión. Vuelve a conectar tu cuenta.');
    this.select(result.account); this.update(result.account, 'connected');
    this.client.setActiveAccount(result.account); // Default SSO choice for new tabs, not other open documents.
    return this.account;
  }
  async token(scopes, interactive = false) {
    await this.initialized; this.synchronize();
    if (!this.account) throw problem('MICROSOFT_CONNECT', 'Conecta tu cuenta Microsoft.');
    const account = this.account, generation = this.generation;
    let result;
    try { result = await this.client.acquireTokenSilent({ scopes, account }); }
    catch (error) {
      if (!interactive || !this.interactionRequired(error)) {
        if (this.interactionRequired(error) && generation === this.generation) this.update(null, 'expired');
        throw problem('MICROSOFT_AUTHORIZE', 'Vuelve a conectar tu cuenta o elige SharePoint y pulsa Continuar para autorizar el sitio.');
      }
      this.synchronize();
      if (generation !== this.generation) throw problem('ACCOUNT_CHANGED', 'La cuenta Microsoft cambió. Conecta de nuevo.');
      result = await this.interact(() => this.client.acquireTokenPopup({ scopes, account }), () => this.client.acquireTokenRedirect({ scopes, account }));
    }
    this.synchronize();
    if (generation !== this.generation || identity(result.account) !== identity(account)) throw problem('ACCOUNT_CHANGED', 'La cuenta Microsoft cambió. Conecta de nuevo.');
    return result.accessToken;
  }
  async disconnect({ all = false } = {}) {
    this.generation++; this.select(null); this.update(null, 'disconnected');
    await this.clientReady;
    if (all) {
      this.client.setActiveAccount(null);
      await this.client.clearCache();
      try { this.events.localStorage.setItem(logoutKey, String(Date.now()) + Math.random()); } catch { /* Account storage events also reconcile removed accounts. */ }
    }
  }
}
