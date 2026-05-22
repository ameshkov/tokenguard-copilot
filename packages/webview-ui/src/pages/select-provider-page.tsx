import { useState } from 'react';
import type { ProviderInfo } from '@tokenguard/shared';
import { Button } from '../components/index.js';

/** Props for the {@link SelectProviderPage} component. */
export interface SelectProviderPageProps {
  /** Available providers to choose from. */
  providers: ProviderInfo[];
  /** Called when a provider is selected. */
  onSelect: (providerId: string) => void;
  /** Called when the user cancels the flow. */
  onCancel: () => void;
}

/**
 * Full-page provider selector for the add-model flow.
 *
 * Displays a dropdown of providers sorted alphabetically.
 * The user picks one and clicks Continue to fetch
 * available models from that provider.
 *
 * @param props - Page props.
 * @returns The page element.
 */
export function SelectProviderPage(props: SelectProviderPageProps): React.JSX.Element {
  const { providers, onSelect, onCancel } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = [...providers].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );

  const handleContinue = () => {
    const id = selectedId ?? (sorted.length > 0 ? sorted[0]!.id : null);
    if (id) onSelect(id);
  };

  return (
    <div>
      <h1>Add Model</h1>
      <p>Select a provider to fetch available models from.</p>

      {providers.length > 0 && (
        <vscode-form-container>
          <vscode-form-group variant="vertical">
            <vscode-label htmlFor="provider-select">Provider</vscode-label>
            <vscode-single-select
              id="provider-select"
              onChange={(e: React.FormEvent<HTMLElement>) => {
                const el = e.currentTarget as HTMLElement & {
                  value: string;
                };
                setSelectedId(el.value);
              }}
            >
              {sorted.map((p) => (
                <vscode-option key={p.id} value={p.id}>
                  {p.name}
                </vscode-option>
              ))}
            </vscode-single-select>
          </vscode-form-group>
        </vscode-form-container>
      )}

      <vscode-form-group variant="vertical">
        <div className="form-actions">
          {providers.length > 0 && <Button onClick={handleContinue}>Continue</Button>}
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </vscode-form-group>
    </div>
  );
}
