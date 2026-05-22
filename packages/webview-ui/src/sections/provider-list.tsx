import { useState } from 'react';
import type { ProviderInfo } from '@tokenguard/shared';
import { Table, type TableColumn, Button, ConfirmDialog } from '../components/index.js';

/** Props for the {@link ProviderList} component. */
export interface ProviderListProps {
  /** List of configured providers. */
  providers: ProviderInfo[];
  /** Called when the user clicks Edit on a provider. */
  onEdit: (provider: ProviderInfo) => void;
  /**
   * Called when the user confirms removal of a provider.
   *
   * Returns a promise that resolves when the operation
   * completes.
   */
  onRemove: (id: string) => Promise<void>;
}

/**
 * Displays the list of configured providers in a table.
 *
 * Shows a confirmation dialog before removing a provider.
 * Disables controls and shows a progress ring while the
 * removal is in progress.
 *
 * @param props - List props.
 * @returns The list element.
 */
export function ProviderList(props: ProviderListProps): React.JSX.Element {
  const { providers, onEdit, onRemove } = props;
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  if (providers.length === 0) {
    return <p>No providers configured</p>;
  }

  const pendingProvider = pendingRemoveId
    ? providers.find((p) => p.id === pendingRemoveId)
    : undefined;

  const handleConfirmRemove = async () => {
    if (!pendingRemoveId) return;
    setRemoving(true);
    try {
      await onRemove(pendingRemoveId);
    } finally {
      setRemoving(false);
      setPendingRemoveId(null);
    }
  };

  const columns: TableColumn<ProviderInfo>[] = [
    { header: 'Name', render: (p) => p.name },
    { header: 'Base URL', render: (p) => p.baseUrl },
    {
      header: 'Actions',
      render: (p) => (
        <div className="provider-actions">
          <Button variant="secondary" onClick={() => onEdit(p)} disabled={removing}>
            Edit
          </Button>
          <Button variant="secondary" onClick={() => setPendingRemoveId(p.id)} disabled={removing}>
            Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Table columns={columns} rows={providers} rowKey={(p) => p.id} />
      {pendingProvider && (
        <ConfirmDialog
          message={`Remove provider "${pendingProvider.name}"? All associated models will be permanently deleted. Usage statistics will be kept.`}
          confirmLabel={removing ? 'Removing…' : 'Remove'}
          onConfirm={() => void handleConfirmRemove()}
          onCancel={removing ? undefined : () => setPendingRemoveId(null)}
          loading={removing}
        />
      )}
    </>
  );
}
