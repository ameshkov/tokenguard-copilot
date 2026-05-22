import { createRoot } from 'react-dom/client';

/* ── Styles ────────────────────────────────────────────── */
import './settings.css';

/* ── VSCode Elements registration (side-effect imports) ── */
import '@vscode-elements/elements/dist/vscode-badge/index.js';
import '@vscode-elements/elements/dist/vscode-button/index.js';
import '@vscode-elements/elements/dist/vscode-checkbox/index.js';
import '@vscode-elements/elements/dist/vscode-collapsible/index.js';
import '@vscode-elements/elements/dist/vscode-divider/index.js';
import '@vscode-elements/elements/dist/vscode-form-container/index.js';
import '@vscode-elements/elements/dist/vscode-form-group/index.js';
import '@vscode-elements/elements/dist/vscode-form-helper/index.js';
import '@vscode-elements/elements/dist/vscode-icon/index.js';
import '@vscode-elements/elements/dist/vscode-option/index.js';
import '@vscode-elements/elements/dist/vscode-progress-ring/index.js';
import '@vscode-elements/elements/dist/vscode-single-select/index.js';
import '@vscode-elements/elements/dist/vscode-table/index.js';
import '@vscode-elements/elements/dist/vscode-table-body/index.js';
import '@vscode-elements/elements/dist/vscode-table-cell/index.js';
import '@vscode-elements/elements/dist/vscode-table-header/index.js';
import '@vscode-elements/elements/dist/vscode-table-header-cell/index.js';
import '@vscode-elements/elements/dist/vscode-table-row/index.js';
import '@vscode-elements/elements/dist/vscode-textfield/index.js';
import '@vscode-elements/elements/dist/vscode-label/index.js';

export { SettingsApp } from './settings-app.js';
export type { Page } from './settings-app.js';

const container = document.getElementById('root');
if (container && !('devManaged' in (container.dataset ?? {}))) {
  void import('./settings-app.js').then(({ SettingsApp }) => {
    const root = createRoot(container);
    root.render(<SettingsApp />);
  });
}
