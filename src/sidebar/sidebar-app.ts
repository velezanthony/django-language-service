// One bundle for every sidebar WebviewView; the host writes
// `data-section="<id>"` on the <body> and SidebarApp reads it.

import { mount } from 'svelte';
import SidebarApp from './SidebarApp.svelte';
import { postMessage } from './lib/vscode';

const root = document.getElementById('sidebar-root');
if (root) {
  mount(SidebarApp, { target: root });
  // Pull-based handshake, so nothing depends on timing: VS Code re-resolves
  // the webview on expand, and the bundle must mount and attach its listener
  // before the provider flushes `pendingPayload`.
  postMessage({ type: 'ready' });
}
