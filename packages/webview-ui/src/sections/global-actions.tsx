import { useState } from 'react';
import type { ResetSettingsResponse, ResetUsageStatsResponse } from '@tokenguard/shared';
import { Button, ConfirmDialog, SectionHeader } from '../components/index.js';
import { sendRequest } from '../vscode-api.js';

/** Props for the {@link GlobalActions} component. */
export interface GlobalActionsProps {
  /** Called after a successful settings reset to refresh the UI. */
  onReset: () => void;
}

/**
 * Danger zone section with destructive actions:
 * Reset Statistics and Reset All Settings.
 *
 * @param props - Component props.
 * @returns The danger zone element.
 */
export function GlobalActions(props: GlobalActionsProps): React.JSX.Element {
  const { onReset } = props;

  // Reset All Settings state
  const [showSettingsConfirm, setShowSettingsConfirm] = useState(false);
  const [resettingSettings, setResettingSettings] = useState(false);

  // Reset Statistics state
  const [showStatsConfirm, setShowStatsConfirm] = useState(false);
  const [resettingStats, setResettingStats] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const handleResetSettings = async () => {
    setResettingSettings(true);
    setError(null);

    const response = await sendRequest<ResetSettingsResponse>({
      type: 'resetSettings',
    });

    setResettingSettings(false);
    setShowSettingsConfirm(false);

    if (!response.success) {
      setError(response.error ?? 'Reset failed');
    } else {
      onReset();
    }
  };

  const handleResetStats = async () => {
    setResettingStats(true);
    setError(null);

    const result = await sendRequest<ResetUsageStatsResponse>({
      type: 'resetUsageStats',
      scope: 'all',
    });

    setResettingStats(false);
    setShowStatsConfirm(false);

    if (!result.success) {
      setError(result.error ?? 'Reset failed');
    }
  };

  return (
    <div className="global-actions">
      <SectionHeader title="Danger Zone" />
      <div className="global-actions__buttons">
        <Button
          variant="secondary"
          onClick={() => setShowStatsConfirm(true)}
          disabled={resettingStats}
        >
          {resettingStats ? 'Resetting…' : 'Reset Statistics'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowSettingsConfirm(true)}
          disabled={resettingSettings}
        >
          {resettingSettings ? 'Resetting…' : 'Reset All Settings'}
        </Button>
      </div>
      {showStatsConfirm && (
        <ConfirmDialog
          message="Delete all usage statistics? This action cannot be undone."
          confirmLabel={resettingStats ? 'Resetting…' : 'Reset Statistics'}
          onConfirm={() => void handleResetStats()}
          onCancel={resettingStats ? undefined : () => setShowStatsConfirm(false)}
          loading={resettingStats}
        />
      )}
      {showSettingsConfirm && (
        <ConfirmDialog
          message={
            'This will permanently delete all providers, ' +
            'models, and usage data. This action cannot ' +
            'be undone.'
          }
          confirmLabel={resettingSettings ? 'Resetting…' : 'Reset All Settings'}
          onConfirm={() => void handleResetSettings()}
          onCancel={resettingSettings ? undefined : () => setShowSettingsConfirm(false)}
          loading={resettingSettings}
        />
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
