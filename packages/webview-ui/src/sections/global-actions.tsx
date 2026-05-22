import { useState } from 'react';
import type { ResetSettingsResponse } from '@tokenguard/shared';
import { Button, ConfirmDialog } from '../components/index.js';
import { sendRequest } from '../vscode-api.js';

/** Props for the {@link GlobalActions} component. */
export interface GlobalActionsProps {
  /** Called after a successful reset to refresh the UI. */
  onReset: () => void;
}

/**
 * Global actions section with Reset Statistics (stub) and
 * Reset All Settings (working).
 *
 * @param props - Component props.
 * @returns The global actions element.
 */
export function GlobalActions(props: GlobalActionsProps): React.JSX.Element {
  const { onReset } = props;
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setResetting(true);
    setError(null);

    const response = await sendRequest<ResetSettingsResponse>({
      type: 'resetSettings',
    });

    setResetting(false);
    setShowConfirm(false);

    if (!response.success) {
      setError(response.error ?? 'Reset failed');
    } else {
      onReset();
    }
  };

  return (
    <div className="global-actions">
      <vscode-divider />
      <div className="global-actions__buttons">
        <Button variant="secondary" disabled>
          Reset Statistics
        </Button>
        <Button variant="secondary" onClick={() => setShowConfirm(true)} disabled={resetting}>
          {resetting ? 'Resetting...' : 'Reset All Settings'}
        </Button>
      </div>
      {showConfirm && (
        <ConfirmDialog
          message={
            'This will permanently delete all providers, ' +
            'models, and usage data. This action cannot ' +
            'be undone.'
          }
          confirmLabel={resetting ? 'Resetting…' : 'Reset All Settings'}
          onConfirm={() => void handleReset()}
          onCancel={resetting ? undefined : () => setShowConfirm(false)}
          loading={resetting}
        />
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
