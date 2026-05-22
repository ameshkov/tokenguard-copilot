import { useRef, useState } from 'react';
import type { FetchedModel } from '@tokenguard/shared';
import { Button } from '../components/index.js';

/** Props for the {@link SelectModelPage} component. */
export interface SelectModelPageProps {
  /** Whether models are being fetched. */
  loading: boolean;
  /** Error message from fetching, or null. */
  error: string | null;
  /** Available models to choose from. */
  models: FetchedModel[];
  /** Called when a model is selected. */
  onSelect: (model: FetchedModel) => void;
  /** Called when the user cancels the flow. */
  onCancel: () => void;
}

/**
 * Full-page model selector for the add-model flow.
 *
 * Displays a dropdown of available models sorted
 * alphabetically. The user picks one and clicks Continue
 * to proceed to the configuration step.
 *
 * @param props - Page props.
 * @returns The page element.
 */
export function SelectModelPage(props: SelectModelPageProps): React.JSX.Element {
  const { loading, error, models, onSelect, onCancel } = props;
  const selectRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = [...models].sort((a, b) => {
    const nameA = (a.name ?? a.id).toLowerCase();
    const nameB = (b.name ?? b.id).toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const handleContinue = () => {
    const id = selectedId ?? (sorted.length > 0 ? sorted[0]!.id : null);
    if (!id) return;
    const model = models.find((m) => m.id === id);
    if (model) onSelect(model);
  };

  const hasModels = !loading && !error && sorted.length > 0;

  return (
    <div>
      <h1>Add Model</h1>
      <p>Select a model to configure.</p>

      {loading && (
        <div className="select-model-page__loading">
          <vscode-progress-ring />
          <span>Loading models…</span>
        </div>
      )}

      {error && <p className="select-model-page__error">{error}</p>}

      {!loading && !error && models.length === 0 && <p>No new models available</p>}

      {hasModels && (
        <vscode-form-container>
          <vscode-form-group variant="vertical">
            <vscode-label htmlFor="model-select">Model</vscode-label>
            <vscode-single-select
              id="model-select"
              ref={selectRef}
              onChange={(e: React.FormEvent<HTMLElement>) => {
                const el = e.currentTarget as HTMLElement & { value: string };
                setSelectedId(el.value);
              }}
            >
              {sorted.map((m) => (
                <vscode-option key={m.id} value={m.id}>
                  {m.name ?? m.id}
                </vscode-option>
              ))}
            </vscode-single-select>
          </vscode-form-group>
        </vscode-form-container>
      )}

      <vscode-form-group variant="vertical">
        <div className="form-actions">
          {hasModels && <Button onClick={handleContinue}>Continue</Button>}
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </vscode-form-group>
    </div>
  );
}
