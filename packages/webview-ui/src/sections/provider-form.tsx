import { useState, useEffect, useRef } from 'react';
import type { ProviderInfo } from '@tokenguard/shared';
import { Button, FormGroup, Input, Label, ConfirmDialog } from '../components/index.js';

/** Props for the {@link ProviderForm} component. */
export interface ProviderFormProps {
  /** Called with form values on valid submission. */
  onSubmit: (name: string, baseUrl: string, apiKey: string) => void;
  /** Whether a request is in progress. */
  loading: boolean;
  /** Error message from the host, or null. */
  error: string | null;
  /** Whether the form is visible. */
  visible: boolean;
  /** Provider being edited, if any. */
  editingProvider?: ProviderInfo;
  /** Called when the user cancels the form. */
  onCancel?: () => void;
}

/**
 * Full-page form for adding or editing an OpenAI-compatible provider.
 *
 * Replaces the settings page entirely. Shows a cancel confirmation
 * dialog before navigating back.
 *
 * @param props - Form props.
 * @returns The form element, or null when hidden.
 */
export function ProviderForm(props: ProviderFormProps): React.JSX.Element | null {
  const { onSubmit, loading, error, visible, editingProvider, onCancel } = props;

  const isEditing = editingProvider !== undefined;

  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const prevLoading = useRef(loading);

  // Pre-fill when editing provider changes
  useEffect(() => {
    if (editingProvider) {
      setName(editingProvider.name);
      setBaseUrl(editingProvider.baseUrl);
      setApiKey('');
      setErrors({});
    } else {
      setName('');
      setBaseUrl('');
      setApiKey('');
      setErrors({});
    }
  }, [editingProvider]);

  // Clear form on successful submit
  useEffect(() => {
    if (prevLoading.current && !loading && !error) {
      setName('');
      setBaseUrl('');
      setApiKey('');
      setErrors({});
    }
    prevLoading.current = loading;
  }, [loading, error]);

  if (!visible) {
    return null;
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!isEditing && !apiKey.trim()) {
      newErrors.apiKey = 'API key is required';
    }
    try {
      new URL(baseUrl);
    } catch {
      newErrors.baseUrl = 'Invalid URL';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(name, baseUrl, apiKey);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      setShowCancelConfirm(true);
    }
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    onCancel?.();
  };

  return (
    <div>
      <h1>{isEditing ? 'Edit Provider' : 'Add Provider'}</h1>
      <p>
        {isEditing
          ? 'Update the provider configuration below.'
          : 'Configure a new OpenAI-compatible provider.'}
      </p>
      <form onSubmit={handleSubmit}>
        <vscode-form-container>
          <FormGroup>
            <Label htmlFor="provider-name">Name</Label>
            <Input
              id="provider-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError('name');
              }}
              disabled={loading}
              errorMessage={errors.name}
            />
          </FormGroup>
          <FormGroup>
            <Label htmlFor="provider-url">Base URL</Label>
            <Input
              id="provider-url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                clearError('baseUrl');
              }}
              disabled={loading}
              errorMessage={errors.baseUrl}
            />
          </FormGroup>
          <FormGroup>
            <Label htmlFor="provider-key">API Key</Label>
            <Input
              id="provider-key"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                clearError('apiKey');
              }}
              disabled={loading}
              placeholder={isEditing ? 'Unchanged' : undefined}
              errorMessage={errors.apiKey}
            />
          </FormGroup>
          {error && <div className="error-banner">{error}</div>}
          <FormGroup>
            <div className="form-actions">
              <Button type="submit" disabled={loading}>
                {isEditing
                  ? loading
                    ? 'Saving...'
                    : 'Save'
                  : loading
                    ? 'Adding...'
                    : 'Add Provider'}
              </Button>
              {onCancel && (
                <Button type="button" variant="secondary" onClick={handleCancel} disabled={loading}>
                  Cancel
                </Button>
              )}
              {loading && <vscode-progress-ring />}
            </div>
          </FormGroup>
        </vscode-form-container>
      </form>
      {showCancelConfirm && (
        <ConfirmDialog
          message="Discard changes and go back to settings?"
          confirmLabel="Discard"
          onConfirm={handleConfirmCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}
