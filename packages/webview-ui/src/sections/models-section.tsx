import { useState } from 'react';
import type { ModelInfo, ProviderInfo } from '@tokenguard/shared';
import { SectionHeader, Table, Button, ConfirmDialog } from '../components/index.js';

/** Props for the {@link ModelsSection} component. */
export interface ModelsSectionProps {
  /** List of configured models. */
  models: ModelInfo[];
  /** List of providers for the provider selector. */
  providers: ProviderInfo[];
  /** Called when the user clicks Add Model. */
  onAdd: () => void;
  /** Called when the user clicks Edit on a model. */
  onEdit: (model: ModelInfo) => void;
  /**
   * Called when the user confirms removal of a model.
   *
   * Returns a promise that resolves when the operation
   * completes.
   */
  onRemove: (providerId: string, modelId: string) => Promise<void>;
}

/**
 * Models section showing configured models in a table.
 *
 * Navigation to add/edit pages is delegated to the parent
 * via callbacks.
 *
 * @param props - Section props.
 * @returns The models section element.
 */
export function ModelsSection(props: ModelsSectionProps): React.JSX.Element {
  const { models, providers, onAdd, onEdit, onRemove } = props;
  const [confirmRemove, setConfirmRemove] = useState<ModelInfo | null>(null);
  const [removing, setRemoving] = useState(false);

  const getProviderName = (providerId: string): string => {
    const p = providers.find((prov) => prov.id === providerId);
    return p?.name ?? providerId;
  };

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      await onRemove(confirmRemove.providerId, confirmRemove.id);
    } finally {
      setRemoving(false);
      setConfirmRemove(null);
    }
  };

  return (
    <div className="models-section">
      <SectionHeader title="Models" />

      {models.length === 0 ? (
        <p className="models-section__empty">No models configured</p>
      ) : (
        <Table
          columns={[
            {
              header: 'Name',
              render: (m: ModelInfo) => m.displayName ?? `${getProviderName(m.providerId)}/${m.id}`,
            },
            {
              header: 'Model',
              render: (m: ModelInfo) => m.id,
            },
            {
              header: 'Provider',
              render: (m: ModelInfo) => getProviderName(m.providerId),
            },
            {
              header: 'Actions',
              render: (m: ModelInfo) => (
                <span className="models-section__actions">
                  <Button variant="secondary" onClick={() => onEdit(m)} disabled={removing}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmRemove(m)}
                    disabled={removing}
                  >
                    Remove
                  </Button>
                </span>
              ),
            },
          ]}
          rows={models}
          rowKey={(m) => `${m.providerId}:${m.id}`}
        />
      )}

      {confirmRemove && (
        <ConfirmDialog
          message={`Remove model "${confirmRemove.displayName ?? confirmRemove.id}"? The model will no longer be available in Copilot Chat. Usage statistics will be kept.`}
          confirmLabel={removing ? 'Removing…' : 'Remove'}
          onConfirm={() => void handleConfirmRemove()}
          onCancel={removing ? undefined : () => setConfirmRemove(null)}
          loading={removing}
        />
      )}

      <Button onClick={onAdd} disabled={providers.length === 0}>
        Add Model
      </Button>
    </div>
  );
}
