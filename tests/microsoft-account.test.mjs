import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { MicrosoftAccount } from '../scripts/microsoft-account.js';

const user = { homeAccountId: 'generic-home', localAccountId: 'generic-local', tenantId: 'generic-tenant', username: 'generic@example.invalid' };
const other = { ...user, homeAccountId: 'other-home', localAccountId: 'other-local' };
const settings = { interactionRequired: error => error.code === 'interaction_required', accountChanged: 'active-account-changed' };
const result = account => ({ account, accessToken: 'generic-test-access' });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(active = user) {
  const shared = { active, accounts: active ? [active] : [], callbacks: new Set() };
  function client() {
    const calls = { silent: 0, login: 0, popup: 0, clear: 0 };
    return {
      calls,
      async initialize() {},
      getActiveAccount() { return shared.active; },
      getAccount(filter) {return shared.accounts.find(a=>["homeAccountId","localAccountId","tenantId"].every(k=>a[k]===filter[k]))||null;},
      addEventCallback(callback) { shared.callbacks.add(callback); },
      setActiveAccount(account) { shared.active = account; for (const callback of shared.callbacks) callback(); },
      async clearCache() { calls.clear++; shared.accounts = []; for(const callback of shared.callbacks)callback(); },
      async acquireTokenSilent({ account }) { calls.silent++; return result(account); },
      async loginPopup() { calls.login++; shared.accounts.push(user); return result(user); },
      async acquireTokenPopup({ account }) { calls.popup++; return result(account); }
    };
  }
  return { shared, client, account: c => new MicrosoftAccount(c, settings) };
}

test('reload restores the explicitly active account only after silent access succeeds', async () => {
  const f = fixture(), c = f.client(), auth = f.account(c), changes = [];
  auth.onChange(change => changes.push(change));
  assert.equal(auth.account, null);
  await auth.initialized;
  assert.equal(auth.account, user);
  assert.equal(changes[0].reason, 'restored');
  assert.equal(c.calls.silent, 1);
  assert.equal(c.calls.login + c.calls.popup, 0);
});

test('a cached account list without an active selection cannot resurrect a disconnected user', async () => {
  const f = fixture(null); f.shared.accounts = [other, user];
  const c = f.client(), auth = f.account(c); await auth.initialized;
  assert.equal(auth.account, null);
  assert.equal(c.calls.silent + c.calls.login + c.calls.popup, 0);
});

test('expired consent or offline startup requires an explicit connection without opening a popup', async () => {
  for (const code of ['interaction_required', 'offline']) {
    const f = fixture(), c = f.client();
    c.acquireTokenSilent = async () => { throw Object.assign(new Error('generic error'), { code }); };
    const auth = f.account(c); await auth.initialized;
    assert.equal(auth.account, null);
    assert.equal(c.calls.login + c.calls.popup, 0);
  }
});

test('a new tab recovers the account selected through a successful login', async () => {
  const f = fixture(null), c = f.client(), first = f.account(c); await first.initialized;
  await first.connect();
  const nextClient = f.client(), next = f.account(nextClient); await next.initialized;
  assert.equal(next.account, user);
  assert.equal(nextClient.calls.login + nextClient.calls.popup, 0);
});

test('global disconnect clears app cache and invalidates other tabs and their pending token requests', async () => {
  const f = fixture(), a = f.account(f.client()), c = f.client(), b = f.account(c);
  await Promise.all([a.initialized, b.initialized]);
  const pending = deferred(); c.acquireTokenSilent = () => pending.promise;
  const token = b.token(['Files.ReadWrite.All']);
  await Promise.resolve();
  await a.disconnect({all:true}); pending.resolve(result(user));
  await assert.rejects(token, { code: 'ACCOUNT_CHANGED' });
  assert.equal(b.account, null);
  assert.equal(f.shared.active, null);
  assert.equal(f.shared.accounts.length, 0);
  const reopened = f.account(f.client()); await reopened.initialized;
  assert.equal(reopened.account, null);
});

test('disconnect wins over an in-flight startup restore', async () => {
  const f = fixture(), c = f.client(), pending = deferred(); c.acquireTokenSilent = () => pending.promise;
  const auth = f.account(c); await auth.clientReady;
  await auth.disconnect(); pending.resolve(result(user)); await auth.initialized;
  assert.equal(auth.account, null);
});

test('a local disconnect does not cancel another tab pending login', async () => {
 const f=fixture(null),a=f.account(f.client()),c=f.client(),b=f.account(c);await Promise.all([a.initialized,b.initialized]);
 const pending=deferred();c.loginPopup=()=>pending.promise;const login=b.connect();await Promise.resolve();
 await a.disconnect();f.shared.accounts.push(user);pending.resolve(result(user));await login;assert.equal(b.account,user);assert.equal(a.account,null);
});

test('switching the shared default preserves each tab pinned account and tenant', async () => {
  for (const next of [other, { ...user, tenantId: 'different-tenant' }]) {
    const f = fixture(), c = f.client(), auth = f.account(c); await auth.initialized;
    c.setActiveAccount(next);
    assert.equal(auth.account, user);
    assert.equal(await auth.token(['User.Read']), 'generic-test-access');
  }
});

test('focus reconciliation invalidates a changed selection even if its broadcast was missed', async () => {
  const f = fixture(), auth = f.account(f.client()); await auth.initialized;
  f.shared.accounts=[]; auth.synchronize();
  assert.equal(auth.account, null);
});

test('silent tokens renew access; interactive fallback is restricted to an explicit request', async () => {
  const f = fixture(), c = f.client(), auth = f.account(c); await auth.initialized;
  assert.equal(await auth.token(['User.Read']), 'generic-test-access');
  c.acquireTokenSilent = async () => { throw Object.assign(new Error('generic expired'), { code: 'interaction_required' }); };
  assert.equal(await auth.token(['Sites.Read.All'], true), 'generic-test-access');
  assert.equal(c.calls.popup, 1);
  await assert.rejects(() => auth.token(['User.Read']), { code: 'MICROSOFT_AUTHORIZE' });
  assert.equal(auth.account, null);
  assert.equal(c.calls.popup, 1);
});

test('a token returned for another tenant cannot be used for the selected account', async () => {
  const f = fixture(), c = f.client(), auth = f.account(c); await auth.initialized;
  c.acquireTokenSilent = async () => result({ ...user, tenantId: 'different-tenant' });
  await assert.rejects(() => auth.token(['User.Read']), { code: 'ACCOUNT_CHANGED' });
});

test('a cross-tab disconnect preserves the in-memory diagram and detaches its cloud file', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, value: '', textContent: '', childElementCount: 0, classList: { toggle() {} }, setAttribute() {}, querySelectorAll: () => [], replaceChildren() {}, addEventListener() {} });
    return elements.get(id);
  };
  const f = fixture(), auth = f.account(f.client()); await auth.initialized;
  const files = { handle: { storageKind: 'microsoft' }, hash: 'generic-base', name: 'Generic.bpmn' };
  const context = {
    window: { NaraMicrosoft: { create: () => ({ auth, files: {}, workspace: { read: () => ({ last: null }), stamp: () => ({}), resume: async () => false } }) } },
    byId: element, browserFiles: files, saving: false,
    browserFileContext: name => { context.fileName = name; }, setDirty: dirty => { context.dirty = dirty; }, status: message => { context.statusText = message; },
    modeler: { saveXML() { throw new Error('Disconnect must not serialize or replace the diagram'); } }
  };
  vm.runInNewContext(await readFile(new URL('../microsoft-ui.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  f.shared.accounts=[]; auth.synchronize();
  assert.equal(files.handle, null);
  assert.equal(context.fileName, 'Generic.bpmn');
  assert.equal(context.dirty, true);
  assert.match(context.statusText, /diagrama sigue abierto/);
  assert.equal(element('connectMicrosoft').textContent, 'Conectar Microsoft');
});

function tabSelection(){const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
test('two account selections survive reload and a local disconnect leaves the other tab and token cache intact',async()=>{
 const f=fixture(),sa=tabSelection(),sb=tabSelection();f.shared.accounts.push(other);
 const ca=f.client(),cb=f.client();cb.loginPopup=async()=>result(other);
 const a=new MicrosoftAccount(ca,{...settings,storage:()=>sa}),b=new MicrosoftAccount(cb,{...settings,storage:()=>sb});await Promise.all([a.initialized,b.initialized]);
 await b.connect();assert.equal(a.account,user);assert.equal(b.account,other);assert.equal(await a.token(['User.Read']),'generic-test-access');
 const reload=new MicrosoftAccount(f.client(),{...settings,storage:()=>sa});await reload.initialized;assert.equal(reload.account,user);
 await b.disconnect();assert.equal(a.account,user);assert.equal(f.shared.accounts.length,2);assert.equal(cb.calls.clear,0);
 const disconnected=new MicrosoftAccount(f.client(),{...settings,storage:()=>sb});await disconnected.initialized;assert.equal(disconnected.account,null);
});
test('malformed tab identity cannot select the first arbitrary cached account',async()=>{
 const f=fixture(),s=tabSelection();s.setItem('narabizagui.microsoft.account.v1',JSON.stringify({homeAccountId:'generic-home'}));
 const auth=new MicrosoftAccount(f.client(),{...settings,storage:()=>s});await auth.initialized;assert.equal(auth.account,null);
});

const blocked = Object.assign(new Error('generic popup blocked'), { code: 'popup_window_error' });
const popupSettings = { ...settings, popupBlocked: error => error.code === 'popup_window_error' };
const flushed = () => new Promise(resolve => setImmediate(resolve));

test('a blocked popup continues the sign-in by redirect only when the editor allows leaving the page', async () => {
  for (const allowed of [true, false]) {
    const f = fixture(null), c = f.client(), redirects = [];
    c.loginPopup = async () => { c.calls.login++; throw blocked; };
    c.loginRedirect = async request => { redirects.push(request); };
    const auth = new MicrosoftAccount(c, popupSettings); await auth.initialized;
    auth.redirectFallback = async () => allowed;
    const pending = auth.connect(); let failure = null; pending.catch(error => { failure = error; });
    await flushed(); await flushed();
    if (allowed) { assert.deepEqual(redirects.map(r => r.prompt), ['select_account']); assert.equal(failure, null); }
    else { assert.equal(redirects.length, 0); assert.equal(failure?.code, 'MICROSOFT_POPUP_BLOCKED'); }
    assert.equal(auth.account, null);
  }
});

test('cancelled or failed popups never fall back to leaving the page', async () => {
  const f = fixture(null), c = f.client(); let redirected = 0, asked = 0;
  c.loginPopup = async () => { throw Object.assign(new Error('generic cancel'), { code: 'user_cancelled', errorCode: 'user_cancelled' }); };
  c.loginRedirect = async () => { redirected++; };
  const auth = new MicrosoftAccount(c, popupSettings); await auth.initialized;
  auth.redirectFallback = async () => { asked++; return true; };
  await assert.rejects(auth.connect(), error => error.errorCode === 'user_cancelled');
  assert.equal(redirected + asked, 0);
});

test('returning from a redirect sign-in connects that account without a silent restore', async () => {
  const f = fixture(other), c = f.client(), changes = [];
  c.handleRedirectPromise = async () => { f.shared.accounts.push(user); return result(user); };
  const auth = new MicrosoftAccount(c, popupSettings); auth.onChange(change => changes.push(change));
  await auth.initialized;
  assert.equal(auth.account, user); assert.equal(auth.redirected, true);
  assert.deepEqual(changes.map(change => change.reason), ['connected']);
  assert.equal(f.shared.active, user); assert.equal(c.calls.silent, 0);
});

test('a failed redirect response leaves the normal restore path intact', async () => {
  const f = fixture(), c = f.client();
  c.handleRedirectPromise = async () => { throw new Error('generic redirect failure'); };
  const auth = new MicrosoftAccount(c, popupSettings); await auth.initialized;
  assert.equal(auth.account, user); assert.equal(auth.redirected, false); assert.equal(c.calls.silent, 1);
});

test('site authorization uses a token redirect when its popup is blocked', async () => {
  const f = fixture(), c = f.client(), redirects = [];
  const auth = new MicrosoftAccount(c, popupSettings); await auth.initialized;
  c.acquireTokenSilent = async () => { throw Object.assign(new Error('generic consent'), { code: 'interaction_required' }); };
  c.acquireTokenPopup = async () => { throw blocked; };
  c.acquireTokenRedirect = async request => { redirects.push(request); };
  auth.redirectFallback = async () => true;
  auth.token(['generic.scope'], true).catch(() => {});
  await flushed(); await flushed();
  assert.deepEqual(redirects, [{ scopes: ['generic.scope'], account: user }]);
});

test('the editor refuses a sign-in redirect while edits or property text could be lost', async () => {
  const element = () => ({ hidden: false, value: '', textContent: '', classList: { toggle() {} }, setAttribute() {}, querySelectorAll: () => [], replaceChildren() {}, addEventListener() {} });
  const f = fixture(null), auth = f.account(f.client()); await auth.initialized;
  const prompts = [];
  const context = {
    window: { NaraMicrosoft: { create: () => ({ auth, files: {}, workspace: { read: () => ({ last: null }), stamp: () => ({}), resume: async () => false } }) }, NaraPropertyDraftPending: () => context.draft },
    byId: element, browserFiles: { handle: null, name: 'Generic.bpmn' }, saving: false, dirty: false, draft: false, status() {},
    confirm: text => { prompts.push(text); return true; }
  };
  vm.runInNewContext(await readFile(new URL('../microsoft-ui.js', import.meta.url), 'utf8'), context);
  context.dirty = true; assert.equal(await auth.redirectFallback(), false);
  context.dirty = false; context.draft = true; assert.equal(await auth.redirectFallback(), false);
  assert.equal(prompts.length, 0);
  context.draft = false; assert.equal(await auth.redirectFallback(), true);
  assert.equal(prompts.length, 1); assert.match(prompts[0], /esta pestaña/);
});
