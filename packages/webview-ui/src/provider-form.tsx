import { useState, useEffect, useRef } from 'react';
import type { ProviderInfo } from '@tokenguard/shared';
import { Button, FormGroup, Input, Label } from './components/index.js';

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
 * Form for adding or editing an OpenAI-compatible provider.
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(name, baseUrl, apiKey);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <FormGroup>
        <Label htmlFor="provider-name">Name</Label>
        <Input
          id="provider-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
          errorMessage={errors.name}
        />
      </FormGroup>
      <FormGroup>
        <Label htmlFor="provider-url">Base URL</Label>
        <Input
          id="provider-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
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
          onChange={(e) => setApiKey(e.target.value)}
          disabled={loading}
          placeholder={isEditing ? 'Unchanged' : undefined}
          errorMessage={errors.apiKey}
        />
      </FormGroup>
      {error && <div className="error-banner">{error}</div>}
      <div className="form-actions">
        <Button type="submit" disabled={loading}>
          {loading ? (isEditing ? 'Saving...' : 'Adding...') : isEditing ? 'Save' : 'Add Provider'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
