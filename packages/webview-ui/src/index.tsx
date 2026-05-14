import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  ProviderInfo,
  GetProvidersResponse,
  AddProviderResponse,
  EditProviderResponse,
  RemoveProviderResponse,
} from '@tokenguard/shared';
import { sendRequest } from './vscode-api.js';
import { ProviderForm } from './provider-form.js';
import { ProviderList } from './provider-list.js';
import { ModelsSection } from './models-section.js';
import { UsageStatsSection } from './usage-stats-section.js';
import { GlobalActions } from './global-actions.js';
import { SectionHeader, Button } from './components/index.js';

/**
 * Root settings application component.
 *
 * @returns The settings page element.
 */
function SettingsApp(): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderInfo | undefined>(undefined);

  const fetchProviders = useCallback(async () => {
    const response = await sendRequest<GetProvidersResponse>({
      type: 'getProviders',
    });
    setProviders(response.providers);
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  const handleAdd = async (name: string, baseUrl: string, apiKey: string) => {
    setLoading(true);
    setError(null);

    const response = await sendRequest<AddProviderResponse>({
      type: 'addProvider',
      name,
      baseUrl,
      apiKey,
    });

    setLoading(false);
    if (!response.success) {
      setError(response.error ?? 'Unknown error');
    } else {
      setError(null);
      setShowForm(false);
      await fetchProviders();
    }
  };

  const handleEdit = async (name: string, baseUrl: string, apiKey: string) => {
    if (!editingProvider) return;
    setLoading(true);
    setError(null);

    const response = await sendRequest<EditProviderResponse>({
      type: 'editProvider',
      id: editingProvider.id,
      name,
      baseUrl,
      apiKey,
    });

    setLoading(false);
    if (!response.success) {
      setError(response.error ?? 'Unknown error');
    } else {
      setError(null);
      setEditingProvider(undefined);
      setShowForm(false);
      await fetchProviders();
    }
  };

  const handleRemove = async (id: string) => {
    const response = await sendRequest<RemoveProviderResponse>({
      type: 'removeProvider',
      id,
    });
    if (response.success) {
      await fetchProviders();
    }
  };

  const handleStartEdit = (provider: ProviderInfo) => {
    setEditingProvider(provider);
    setShowForm(true);
    setError(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProvider(undefined);
    setError(null);
  };

  const handleStartAdd = () => {
    setEditingProvider(undefined);
    setShowForm(true);
    setError(null);
  };

  return (
    <main className="settings-container">
      <h1>TokenGuard Copilot Settings</h1>
      <p>Manage providers, models, and usage.</p>

      <SectionHeader title="Providers" />
      <ProviderList
        providers={providers}
        onEdit={handleStartEdit}
        onRemove={(id) => void handleRemove(id)}
      />

      {showForm ? (
        <ProviderForm
          onSubmit={editingProvider ? handleEdit : handleAdd}
          loading={loading}
          error={error}
          visible={true}
          editingProvider={editingProvider}
          onCancel={handleCancel}
        />
      ) : (
        <Button onClick={handleStartAdd}>+ Add Provider</Button>
      )}

      <ModelsSection />
      <UsageStatsSection />
      <GlobalActions onReset={() => void fetchProviders()} />
    </main>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SettingsApp />);
}
