// Must run before any other import that touches
// acquireVsCodeApi.
import './mock-vscode-api.js';

// Import the playground dev toolbar.
import '@vscode-elements/webview-playground';
import codiconStyleHref from '@vscode/codicons/dist/codicon.css?url';

import { createRoot } from 'react-dom/client';
import { SettingsApp } from '@tokenguard/webview-ui';

function ensureCodiconStylesheet(): void {
  if (document.getElementById('vscode-codicon-stylesheet')) {
    return;
  }

  const link = document.createElement('link');
  link.id = 'vscode-codicon-stylesheet';
  link.rel = 'stylesheet';
  link.href = codiconStyleHref;
  document.head.appendChild(link);
}

/** Dev wrapper that adds the playground toolbar. */
function DevApp(): React.JSX.Element {
  return (
    <>
      <vscode-dev-toolbar />
      <SettingsApp />
    </>
  );
}

ensureCodiconStylesheet();

createRoot(document.getElementById('root')!).render(<DevApp />);
