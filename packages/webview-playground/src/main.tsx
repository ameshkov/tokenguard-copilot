// Must run before any other import that touches
// acquireVsCodeApi.
import './mock-vscode-api.js';

// Import the playground dev toolbar.
import '@vscode-elements/webview-playground';

import { createRoot } from 'react-dom/client';
import { SettingsApp } from '@tokenguard/webview-ui';

/** Dev wrapper that adds the playground toolbar. */
function DevApp(): React.JSX.Element {
  return (
    <>
      <vscode-dev-toolbar />
      <SettingsApp />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<DevApp />);
