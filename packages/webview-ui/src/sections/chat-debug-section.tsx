import { useState, useEffect, useCallback } from 'react';
import type {
  GetChatDebugSettingsResponse,
  UpdateChatDebugSettingsResponse,
  ClearChatDebugLogsResponse,
} from '@tokenguard/shared';
import {
  Button,
  ConfirmDialog,
  FormGroup,
  Input,
  Label,
  SectionHeader,
} from '../components/index.js';
import { sendRequest } from '../vscode-api.js';

/**
 * Chat Debug settings section.
 *
 * Displays an enabled toggle, TTL input, and action
 * buttons for inspecting and clearing debug logs.
 * Fetches current settings on mount and persists
 * changes via the host message protocol.
 *
 * @returns The chat debug section element.
 */
export function ChatDebugSection(): React.JSX.Element {
  const [enabled, setEnabled] = useState(false);
  const [ttlHours, setTtlHours] = useState('24');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchSettings = useCallback(async () => {
    const response = await sendRequest<GetChatDebugSettingsResponse>({
      type: 'getChatDebugSettings',
    });
    setEnabled(response.settings.enabled);
    setTtlHours(String(response.settings.ttlHours));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleToggle = async () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    setError(null);

    const response = await sendRequest<UpdateChatDebugSettingsResponse>({
      type: 'updateChatDebugSettings',
      enabled: newEnabled,
    });

    if (!response.success) {
      setEnabled(!newEnabled);
      setError(response.error ?? 'Update failed');
    }
  };

  const handleTtlBlur = async () => {
    const parsed = parseInt(ttlHours, 10);
    if (isNaN(parsed) || parsed < 1) {
      setError('TTL must be at least 1 hour');
      return;
    }
    setError(null);

    const response = await sendRequest<UpdateChatDebugSettingsResponse>({
      type: 'updateChatDebugSettings',
      ttlHours: parsed,
    });

    if (!response.success) {
      setError(response.error ?? 'Update failed');
    }
  };

  const handleClear = async () => {
    setClearing(true);
    setError(null);

    await sendRequest<ClearChatDebugLogsResponse>({
      type: 'clearChatDebugLogs',
    });

    setClearing(false);
    setShowClearConfirm(false);
  };

  if (!loaded) {
    return (
      <div className="chat-debug-section">
        <SectionHeader title="Chat Debug" />
        <vscode-progress-ring />
      </div>
    );
  }

  return (
    <div className="chat-debug-section">
      <SectionHeader title="Chat Debug" />
      <p>
        When enabled, the extension logs all model requests and responses to disk for debugging
        purposes.
      </p>

      {enabled && (
        <p className="chat-debug-section__hint">
          A <strong>Chat Debug Logs</strong> panel appears in the Explorer sidebar when logging is
          enabled. Expand a session to browse individual request logs.
        </p>
      )}

      <FormGroup>
        <vscode-checkbox
          checked={enabled}
          label="Enabled"
          onClick={() => void handleToggle()}
        ></vscode-checkbox>
      </FormGroup>

      <FormGroup>
        <Label htmlFor="chatDebugTtl">Time-to-live (hours)</Label>
        <div onBlur={() => void handleTtlBlur()}>
          <Input
            id="chatDebugTtl"
            type="number"
            value={ttlHours}
            step="1"
            onChange={(e) => setTtlHours(e.target.value)}
          />
        </div>
      </FormGroup>

      <div className="chat-debug-section__buttons">
        <Button variant="secondary" onClick={() => setShowClearConfirm(true)} disabled={clearing}>
          {clearing ? 'Clearing...' : 'Clear Logs'}
        </Button>
      </div>
      {showClearConfirm && (
        <ConfirmDialog
          message="This will permanently delete all debug logs. This action cannot be undone."
          confirmLabel={clearing ? 'Clearing…' : 'Clear Logs'}
          onConfirm={() => void handleClear()}
          onCancel={clearing ? undefined : () => setShowClearConfirm(false)}
          loading={clearing}
        />
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
