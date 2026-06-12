import { useState } from 'react';
import type {
  CacheControlTtl,
  CustomField,
  FetchedModel,
  ModelConfig,
  ModelDefaultsResult,
  ModelInfo,
} from '@tokenguard/shared';
import { Button, ConfirmDialog, FormGroup } from '../../components/index.js';
import { CustomFieldsEditor } from '../custom-fields-editor.js';
import {
  ModelConfigBasicFields,
  ModelConfigCapabilitiesSection,
  ModelConfigReasoningSection,
} from './model-config-sections.js';
import {
  ModelConfigCachingSection,
  ModelConfigCostSection,
  ModelConfigSamplingSection,
} from './model-config-advanced-sections.js';
import { useModelConfigPreFill } from './use-model-config-prefill.js';
import { validateFormState, fieldLabel, buildModelConfig } from './model-config-validation.js';
import type { ModelConfigFormState } from './model-config-validation.js';
import { useEffortActions } from './use-effort-actions.js';

/** Props for the {@link ModelConfigDialog} component. */
export interface ModelConfigDialogProps {
  fetchedModel?: FetchedModel;
  defaults?: ModelDefaultsResult | null;
  editingModel?: ModelInfo;
  providerName?: string;
  loading: boolean;
  error: string | null;
  onSubmit: (config: ModelConfig) => void;
  onCancel: () => void;
}

/**
 * Dialog for configuring model parameters.
 *
 * Supports three modes: add with provider data, add with
 * defaults, and edit existing model.
 *
 * @param props - Dialog props.
 * @returns The dialog element.
 */
export function ModelConfigDialog(props: ModelConfigDialogProps): React.JSX.Element {
  const { fetchedModel, defaults, editingModel, providerName, loading, error, onSubmit, onCancel } =
    props;
  const isEditing = editingModel !== undefined;

  const [displayName, setDisplayName] = useState('');
  const [maxContextWindowTokens, setMaxContextWindowTokens] = useState('');
  const [maxOutputTokens, setMaxOutputTokens] = useState('');
  const [streaming, setStreaming] = useState(true);
  const [vision, setVision] = useState(false);
  const [temperature, setTemperature] = useState('');
  const [topP, setTopP] = useState('');
  const [frequencyPenalty, setFrequencyPenalty] = useState('');
  const [presencePenalty, setPresencePenalty] = useState('');
  const [defaultReasoningEffort, setDefaultReasoningEffort] = useState('');
  const [reasoningEffortMap, setReasoningEffortMap] = useState<Record<string, string>>({});
  const [newEffortName, setNewEffortName] = useState('');
  const [newEffortParams, setNewEffortParams] = useState('');
  const [preserveReasoning, setPreserveReasoning] = useState(false);
  const [inputCostPer1m, setInputCostPer1m] = useState('');
  const [outputCostPer1m, setOutputCostPer1m] = useState('');
  const [cachedInputCostPer1m, setCachedInputCostPer1m] = useState('');
  const [cacheControlEnabled, setCacheControlEnabled] = useState(false);
  const [cacheMaxMarkers, setCacheMaxMarkers] = useState('4');
  const [cacheTtl, setCacheTtl] = useState<CacheControlTtl | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [prefilledFields, setPrefilledFields] = useState<Record<string, string>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useModelConfigPreFill(editingModel, fetchedModel, defaults, {
    setDisplayName,
    setMaxContextWindowTokens,
    setMaxOutputTokens,
    setStreaming,
    setVision,
    setTemperature,
    setTopP,
    setFrequencyPenalty,
    setPresencePenalty,
    setDefaultReasoningEffort,
    setReasoningEffortMap,
    setPreserveReasoning,
    setInputCostPer1m,
    setOutputCostPer1m,
    setCachedInputCostPer1m,
    setCacheControlEnabled,
    setCacheMaxMarkers,
    setCacheTtl,
    setCustomFields,
    setPrefilledFields,
  });

  const { addEffort, removeEffort } = useEffortActions(
    reasoningEffortMap,
    setReasoningEffortMap,
    defaultReasoningEffort,
    setDefaultReasoningEffort,
    setErrors,
  );

  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const prefillHint = (field: string): React.JSX.Element | null => {
    const source = prefilledFields[field];
    if (!source) return null;
    return (
      <small className="model-config-dialog__prefill-hint">
        {source === 'provider'
          ? 'Pre-filled from provider'
          : 'Pre-filled from known defaults for this model'}
      </small>
    );
  };

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const state: ModelConfigFormState = {
      displayName,
      maxContextWindowTokens,
      maxOutputTokens,
      streaming,
      vision,
      temperature,
      topP,
      frequencyPenalty,
      presencePenalty,
      defaultReasoningEffort,
      reasoningEffortMap,
      preserveReasoning,
      inputCostPer1m,
      outputCostPer1m,
      cachedInputCostPer1m,
      cacheControlEnabled,
      cacheMaxMarkers,
      cacheTtl,
      customFields,
    };
    const validationErrors = validateFormState(state);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    onSubmit(buildModelConfig(state));
  };

  return (
    <form onSubmit={handleSubmit} className="model-config-dialog">
      <vscode-form-container>
        {error && <p className="model-config-dialog__error">{error}</p>}

        <ModelConfigBasicFields
          displayName={displayName}
          maxContextWindowTokens={maxContextWindowTokens}
          maxOutputTokens={maxOutputTokens}
          providerName={providerName}
          fetchedModel={fetchedModel}
          editingModel={editingModel}
          errors={errors}
          loading={loading}
          prefillHint={prefillHint}
          setDisplayName={setDisplayName}
          setMaxContextWindowTokens={setMaxContextWindowTokens}
          setMaxOutputTokens={setMaxOutputTokens}
          clearError={clearError}
        />

        <vscode-collapsible title="Advanced Settings">
          <ModelConfigCapabilitiesSection
            streaming={streaming}
            vision={vision}
            loading={loading}
            prefillHint={prefillHint}
            setStreaming={setStreaming}
            setVision={setVision}
          />

          <ModelConfigReasoningSection
            reasoningEffortMap={reasoningEffortMap}
            newEffortName={newEffortName}
            newEffortParams={newEffortParams}
            defaultReasoningEffort={defaultReasoningEffort}
            preserveReasoning={preserveReasoning}
            errors={errors}
            loading={loading}
            prefillHint={prefillHint}
            setReasoningEffortMap={setReasoningEffortMap}
            setNewEffortName={setNewEffortName}
            setNewEffortParams={setNewEffortParams}
            setDefaultReasoningEffort={setDefaultReasoningEffort}
            setPreserveReasoning={setPreserveReasoning}
            clearError={clearError}
            addEffort={() =>
              addEffort(newEffortName, newEffortParams, setNewEffortName, setNewEffortParams)
            }
            removeEffort={removeEffort}
          />

          <ModelConfigCachingSection
            cacheControlEnabled={cacheControlEnabled}
            cacheMaxMarkers={cacheMaxMarkers}
            cacheTtl={cacheTtl}
            loading={loading}
            prefillHint={prefillHint}
            setCacheControlEnabled={setCacheControlEnabled}
            setCacheMaxMarkers={setCacheMaxMarkers}
            setCacheTtl={setCacheTtl}
          />

          <ModelConfigSamplingSection
            temperature={temperature}
            topP={topP}
            frequencyPenalty={frequencyPenalty}
            presencePenalty={presencePenalty}
            errors={errors}
            loading={loading}
            prefillHint={prefillHint}
            setTemperature={setTemperature}
            setTopP={setTopP}
            setFrequencyPenalty={setFrequencyPenalty}
            setPresencePenalty={setPresencePenalty}
            clearError={clearError}
          />

          <CustomFieldsEditor
            customFields={customFields}
            onChange={setCustomFields}
            disabled={loading}
          />

          <ModelConfigCostSection
            inputCostPer1m={inputCostPer1m}
            outputCostPer1m={outputCostPer1m}
            cachedInputCostPer1m={cachedInputCostPer1m}
            loading={loading}
            prefillHint={prefillHint}
            setInputCostPer1m={setInputCostPer1m}
            setOutputCostPer1m={setOutputCostPer1m}
            setCachedInputCostPer1m={setCachedInputCostPer1m}
          />
        </vscode-collapsible>

        <FormGroup>
          {Object.keys(errors).length > 0 && (
            <div className="model-config-dialog__error">
              Please fix the following errors:{' '}
              {Object.keys(errors)
                .map((f) => fieldLabel(f))
                .join(', ')}
              .
            </div>
          )}
          <div className="model-config-dialog__actions">
            <Button type="submit" disabled={loading}>
              {loading
                ? isEditing
                  ? 'Saving…'
                  : 'Adding…'
                : isEditing
                  ? 'Save Changes'
                  : 'Add Model'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCancelConfirm(true)}
              disabled={loading}
            >
              Cancel
            </Button>
            {loading && <vscode-progress-ring />}
          </div>
        </FormGroup>
      </vscode-form-container>

      {showCancelConfirm && (
        <ConfirmDialog
          message="Discard changes and go back to settings?"
          confirmLabel="Discard"
          onConfirm={() => {
            setShowCancelConfirm(false);
            onCancel();
          }}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </form>
  );
}
