import type { FetchedModel, ModelInfo } from '@tokenguard/shared';
import { Button, FormGroup, Input, Label } from '../../components/index.js';

/** Props shared by all model config section sub-components. */
interface SectionBaseProps {
  /** Returns a pre-fill hint element, or null. */
  prefillHint: (field: string) => React.JSX.Element | null;
  /** Whether all inputs should be disabled. */
  loading: boolean;
}

// ──────────────────── BasicFields ────────────────────

/** Props for {@link ModelConfigBasicFields}. */
export interface ModelConfigBasicFieldsProps extends SectionBaseProps {
  displayName: string;
  maxContextWindowTokens: string;
  maxOutputTokens: string;
  providerName?: string;
  fetchedModel?: FetchedModel;
  editingModel?: ModelInfo;
  errors: Record<string, string>;
  setDisplayName: (v: string) => void;
  setMaxContextWindowTokens: (v: string) => void;
  setMaxOutputTokens: (v: string) => void;
  clearError: (field: string) => void;
}

/**
 * Name and token fields that are always visible at the top of the form.
 *
 * @param props - Field props.
 * @returns The basic fields section.
 */
export function ModelConfigBasicFields(props: ModelConfigBasicFieldsProps): React.JSX.Element {
  const {
    displayName,
    maxContextWindowTokens,
    maxOutputTokens,
    providerName,
    fetchedModel,
    editingModel,
    errors,
    loading,
    prefillHint,
    setDisplayName,
    setMaxContextWindowTokens,
    setMaxOutputTokens,
    clearError,
  } = props;

  return (
    <>
      <FormGroup>
        <Label htmlFor="model-display-name">Display Name</Label>
        {prefillHint('displayName')}
        <Input
          id="model-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={
            providerName && fetchedModel
              ? `${providerName}/${fetchedModel.id}`
              : providerName && editingModel
                ? `${providerName}/${editingModel.id}`
                : 'Optional display name'
          }
          disabled={loading}
        />
      </FormGroup>

      <FormGroup>
        <Label htmlFor="model-context-tokens">Max Context Window Tokens</Label>
        {prefillHint('maxContextWindowTokens')}
        <Input
          id="model-context-tokens"
          type="number"
          value={maxContextWindowTokens}
          onChange={(e) => {
            setMaxContextWindowTokens(e.target.value);
            clearError('maxContextWindowTokens');
          }}
          errorMessage={errors.maxContextWindowTokens}
          disabled={loading}
        />
        <vscode-form-helper>
          Maximum number of tokens the model can process in a single request, including both input
          and output.
        </vscode-form-helper>
      </FormGroup>

      <FormGroup>
        <Label htmlFor="model-output-tokens">Max Output Tokens</Label>
        {prefillHint('maxOutputTokens')}
        <Input
          id="model-output-tokens"
          type="number"
          value={maxOutputTokens}
          onChange={(e) => {
            setMaxOutputTokens(e.target.value);
            clearError('maxOutputTokens');
          }}
          errorMessage={errors.maxOutputTokens}
          disabled={loading}
        />
        <vscode-form-helper>
          Maximum number of tokens the model can generate in a single response. Must not exceed the
          context window size.
        </vscode-form-helper>
      </FormGroup>
    </>
  );
}

// ──────────────────── Capabilities ────────────────────

/** Props for {@link ModelConfigCapabilitiesSection}. */
export interface ModelConfigCapabilitiesSectionProps extends SectionBaseProps {
  streaming: boolean;
  vision: boolean;
  setStreaming: (v: boolean) => void;
  setVision: (v: boolean) => void;
}

/**
 * Streaming and vision capability checkboxes.
 *
 * @param props - Section props.
 * @returns The capabilities section.
 */
export function ModelConfigCapabilitiesSection(
  props: ModelConfigCapabilitiesSectionProps,
): React.JSX.Element {
  const { streaming, vision, loading, prefillHint, setStreaming, setVision } = props;

  return (
    <div className="model-config-dialog__section">
      <h3 className="model-config-dialog__section-title">Capabilities</h3>
      <FormGroup>
        {prefillHint('streaming')}
        <vscode-checkbox
          checked={streaming || undefined}
          disabled={loading || undefined}
          onchange={() => setStreaming(!streaming)}
        >
          Streaming
        </vscode-checkbox>
        <vscode-form-helper>
          Stream responses token-by-token. Recommended for large requests where the response may
          take several minutes, as the connection could be dropped due to inactivity.
        </vscode-form-helper>
      </FormGroup>
      <FormGroup>
        {prefillHint('vision')}
        <vscode-checkbox
          checked={vision || undefined}
          disabled={loading || undefined}
          onchange={() => setVision(!vision)}
        >
          Vision
        </vscode-checkbox>
        <vscode-form-helper>Allow the model to accept image inputs.</vscode-form-helper>
      </FormGroup>
    </div>
  );
}

// ──────────────────── Reasoning ────────────────────

/** Props for {@link ModelConfigReasoningSection}. */
export interface ModelConfigReasoningSectionProps extends SectionBaseProps {
  reasoningEffortMap: Record<string, string>;
  newEffortName: string;
  newEffortParams: string;
  defaultReasoningEffort: string;
  preserveReasoning: boolean;
  errors: Record<string, string>;
  setReasoningEffortMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setNewEffortName: (v: string) => void;
  setNewEffortParams: (v: string) => void;
  setDefaultReasoningEffort: (v: string) => void;
  setPreserveReasoning: (v: boolean) => void;
  clearError: (field: string) => void;
  addEffort: () => void;
  removeEffort: (name: string) => void;
}

/**
 * Reasoning effort configuration: table, add form, default select, preserve checkbox.
 *
 * @param props - Section props.
 * @returns The reasoning section.
 */
export function ModelConfigReasoningSection(
  props: ModelConfigReasoningSectionProps,
): React.JSX.Element {
  const {
    reasoningEffortMap,
    newEffortName,
    newEffortParams,
    defaultReasoningEffort,
    preserveReasoning,
    errors,
    loading,
    prefillHint,
    setReasoningEffortMap,
    setNewEffortName,
    setNewEffortParams,
    setDefaultReasoningEffort,
    setPreserveReasoning,
    clearError,
    addEffort,
    removeEffort,
  } = props;

  const effortNames = Object.keys(reasoningEffortMap);

  return (
    <div className="model-config-dialog__section">
      <h3 className="model-config-dialog__section-title">Reasoning</h3>
      {prefillHint('reasoningEffortMap')}

      {effortNames.length > 0 && (
        <vscode-table bordered-rows className="model-config-dialog__efforts-table">
          <vscode-table-header slot="header">
            <vscode-table-header-cell>Effort Level</vscode-table-header-cell>
            <vscode-table-header-cell>Body Parameters (JSON)</vscode-table-header-cell>
            <vscode-table-header-cell className="model-config-dialog__effort-actions-col">
              &nbsp;
            </vscode-table-header-cell>
          </vscode-table-header>
          <vscode-table-body slot="body">
            {effortNames.map((name) => (
              <vscode-table-row key={name}>
                <vscode-table-cell>{name}</vscode-table-cell>
                <vscode-table-cell>
                  <Input
                    value={reasoningEffortMap[name] ?? ''}
                    onChange={(e) => {
                      setReasoningEffortMap((prev) => ({ ...prev, [name]: e.target.value }));
                      clearError(`effortMap_${name}`);
                    }}
                    placeholder="e.g. {}"
                    disabled={loading}
                  />
                  {errors[`effortMap_${name}`] && (
                    <vscode-form-helper severity="error">
                      {errors[`effortMap_${name}`]}
                    </vscode-form-helper>
                  )}
                </vscode-table-cell>
                <vscode-table-cell>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => removeEffort(name)}
                    disabled={loading}
                    aria-label={`Remove ${name}`}
                  >
                    ×
                  </Button>
                </vscode-table-cell>
              </vscode-table-row>
            ))}
          </vscode-table-body>
        </vscode-table>
      )}

      <div className="model-config-dialog__add-effort">
        <Input
          value={newEffortName}
          onChange={(e) => setNewEffortName(e.target.value)}
          placeholder="Effort name"
          disabled={loading}
        />
        <Input
          value={newEffortParams}
          onChange={(e) => {
            setNewEffortParams(e.target.value);
            clearError('newEffortParams');
          }}
          placeholder="Body params JSON (optional)"
          disabled={loading}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={addEffort}
          disabled={loading || !newEffortName.trim()}
        >
          Add
        </Button>
      </div>
      {errors.newEffortParams && (
        <vscode-form-helper severity="error">{errors.newEffortParams}</vscode-form-helper>
      )}

      <FormGroup>
        {prefillHint('defaultReasoningEffort')}
        <Label htmlFor="model-default-effort">Default Reasoning Effort</Label>
        <vscode-single-select
          id="model-default-effort"
          value={defaultReasoningEffort}
          disabled={loading || undefined}
          onchange={(e: Event) => setDefaultReasoningEffort((e.target as HTMLSelectElement).value)}
        >
          {effortNames.length === 0 && <vscode-option value="">None</vscode-option>}
          {effortNames.map((name) => (
            <vscode-option
              key={name}
              value={name}
              selected={name === defaultReasoningEffort || undefined}
            >
              {name}
            </vscode-option>
          ))}
        </vscode-single-select>
      </FormGroup>
      <FormGroup>
        {prefillHint('preserveReasoning')}
        <vscode-checkbox
          checked={preserveReasoning || undefined}
          disabled={loading || undefined}
          onchange={() => setPreserveReasoning(!preserveReasoning)}
        >
          Preserve Reasoning
        </vscode-checkbox>
        <vscode-form-helper>
          Pass reasoning tokens from previous turns back to the model in multi-turn conversations.
          Improves coherence but increases token usage and cost.
        </vscode-form-helper>
      </FormGroup>
    </div>
  );
}
