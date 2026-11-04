import { PublicClientApplication, InteractionRequiredAuthError, BrowserAuthError, EventType } from '@azure/msal-browser';
import { MicrosoftFiles } from '../microsoft-files.js';
import { MicrosoftAccount } from './microsoft-account.js';
import { MicrosoftWorkspace } from './microsoft-workspace.js';
import { MicrosoftFileLifecycle } from '../microsoft-lifecycle.js';

// OAuth client identifiers are public application identifiers, not client secrets.
// Keep the registered production callback while both editor URLs are supported.
const productionOrigin = 'https://demo.naraconsultores.com';
const microsoftRedirectUri = location.origin === productionOrigin
  ? new URL('/NaraBizagui/microsoft-auth.html', productionOrigin).href
  : new URL('microsoft-auth.html', location.href).href;
const clientId = 'f6e8c708-7319-4fde-8220-af052e371621';
window.NaraMicrosoft = { FileLifecycle: MicrosoftFileLifecycle, create() {
    const client = new PublicClientApplication({
      auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: microsoftRedirectUri },
      cache: { cacheLocation: 'localStorage' },
      system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback() {} } }
    });
    const auth = new MicrosoftAccount(client, {
      interactionRequired: error => error instanceof InteractionRequiredAuthError,
      popupBlocked: error => error instanceof BrowserAuthError && ['popup_window_error', 'empty_window_error'].includes(error.errorCode),
      accountChanged: EventType.ACCOUNT_REMOVED
    });
    window.addEventListener('focus', () => auth.synchronize());
    window.addEventListener('pageshow', () => auth.synchronize());
    const files = new MicrosoftFiles(auth);
    return { auth, files, workspace: new MicrosoftWorkspace(auth, files) };
} };
