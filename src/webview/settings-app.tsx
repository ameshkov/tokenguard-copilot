import React from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Root component for the settings webview.
 *
 * Renders the extension settings page using VS Code's built-in
 * CSS variables for consistent styling.
 */
function SettingsApp(): React.JSX.Element {
  return (
    <main className="settings-container">
      <h1>OAI Copilot Settings</h1>
      <p>Configure your OpenAI-compatible model endpoints.</p>
    </main>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SettingsApp />);
}
