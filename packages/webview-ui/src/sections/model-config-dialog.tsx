import { useState, useEffect } from 'react';
import type {
  CacheControlConfig,
  CacheControlTtl,
  CustomField,
  CustomFieldType,
  FetchedModel,
  ModelConfig,
  ModelDefaultsResult,
  ModelInfo,
} from '@tokenguard/shared';
import { Button, ConfirmDialog, FormGroup, Input, Label } from '../components/index.js';
import { CustomFieldsEditor, hasCustomFieldErrors } from './custom-fields-editor.js';

/**
 * Infers a {@link CustomFieldType} from a JSON value.
 *
 * @param value - The value to inspect.
 * @returns The inferred type.
 */
function inferCustomFieldType(value: unknown): CustomFieldType {
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'json';
  }
}

/** Props for the {@link ModelConfigDialog} component. */
export interface ModelConfigDialogProps {
  /** Pre-fill data from the /models response. */
  fetchedModel?: FetchedModel;
  /** Pre-fill data from bundled defaults. */
  defaults?: ModelDefaultsResult | null;
  /** Existing model data for edit mode. */
  editingModel?: ModelInfo;
  /** Provider name for placeholder display. */
  providerName?: string;
  /** Loading state. */
  loading: boolean;
  /** Error message from host. */
  error: string | null;
  /** Called with the completed configuration. */
  onSubmit: (config: ModelConfig) => void;
  /** Called when the user cancels. */
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

  // Pre-fill values based on mode
  useEffect(() => {
    if (isEditing && editingModel) {
      setDisplayName(editingModel.displayName ?? '');
      setMaxContextWindowTokens(String(editingModel.maxContextWindowTokens));
      setMaxOutputTokens(String(editingModel.maxOutputTokens));
      setStreaming(editingModel.streaming);
      setVision(editingModel.vision);
      setTemperature(editingModel.temperature !== null ? String(editingModel.temperature) : '');
      setTopP(editingModel.topP !== null ? String(editingModel.topP) : '');
      setFrequencyPenalty(
        editingModel.frequencyPenalty !== null ? String(editingModel.frequencyPenalty) : '',
      );
      setPresencePenalty(
        editingModel.presencePenalty !== null ? String(editingModel.presencePenalty) : '',
      );
      setDefaultReasoningEffort(editingModel.defaultReasoningEffort ?? '');
      if (editingModel.reasoningEffortMap) {
        try {
          const map = JSON.parse(editingModel.reasoningEffortMap) as Record<
            string,
            Record<string, unknown>
          >;
          const entries: Record<string, string> = {};
          for (const [key, val] of Object.entries(map)) {
            entries[key] = JSON.stringify(val);
          }
          setReasoningEffortMap(entries);
        } catch {
          setReasoningEffortMap({});
        }
      } else {
        setReasoningEffortMap({});
      }
      setPreserveReasoning(editingModel.preserveReasoning);
      setInputCostPer1m(
        editingModel.inputCostPer1m !== null ? String(editingModel.inputCostPer1m) : '',
      );
      setOutputCostPer1m(
        editingModel.outputCostPer1m !== null ? String(editingModel.outputCostPer1m) : '',
      );
      setCachedInputCostPer1m(
        editingModel.cachedInputCostPer1m !== null ? String(editingModel.cachedInputCostPer1m) : '',
      );
      if (editingModel.cacheControl) {
        setCacheControlEnabled(editingModel.cacheControl.enabled);
        setCacheMaxMarkers(String(editingModel.cacheControl.maxMarkers));
        setCacheTtl(
          editingModel.cacheControl.ttl !== undefined ? editingModel.cacheControl.ttl : '',
        );
      }
      if (editingModel.customFields) {
        try {
          setCustomFields(JSON.parse(editingModel.customFields) as CustomField[]);
        } catch {
          setCustomFields([]);
        }
      }
      setPrefilledFields({});
      return;
    }

    const filled: Record<string, string> = {};

    // Pre-fill from provider response
    if (fetchedModel) {
      if (fetchedModel.name) {
        setDisplayName(fetchedModel.name);
        filled.displayName = 'provider';
      }
      if (fetchedModel.maxContextWindowTokens !== null) {
        setMaxContextWindowTokens(String(fetchedModel.maxContextWindowTokens));
        filled.maxContextWindowTokens = 'provider';
      }
      if (fetchedModel.maxOutputTokens !== null) {
        setMaxOutputTokens(String(fetchedModel.maxOutputTokens));
        filled.maxOutputTokens = 'provider';
      }
      if (fetchedModel.vision !== null) {
        setVision(fetchedModel.vision);
        filled.vision = 'provider';
      }
      if (fetchedModel.defaultReasoningEffort !== null) {
        setDefaultReasoningEffort(fetchedModel.defaultReasoningEffort);
        filled.defaultReasoningEffort = 'provider';
      }

      // Pre-fill reasoning effort map from provider's supportedReasoningEfforts
      if (
        fetchedModel.supportedReasoningEfforts !== null &&
        fetchedModel.supportedReasoningEfforts.length > 0
      ) {
        const entries: Record<string, string> = {};
        for (const effort of fetchedModel.supportedReasoningEfforts) {
          entries[effort] = JSON.stringify({ reasoning_effort: effort });
        }
        setReasoningEffortMap(entries);
        filled.reasoningEffortMap = 'provider';
      }

      // Pre-fill costs from provider pricing
      if (fetchedModel.inputCostPer1M !== null) {
        setInputCostPer1m(String(fetchedModel.inputCostPer1M));
        filled.inputCostPer1m = 'provider';
      }
      if (fetchedModel.outputCostPer1M !== null) {
        setOutputCostPer1m(String(fetchedModel.outputCostPer1M));
        filled.outputCostPer1m = 'provider';
      }
      if (fetchedModel.cachedInputCostPer1M !== null) {
        setCachedInputCostPer1m(String(fetchedModel.cachedInputCostPer1M));
        filled.cachedInputCostPer1m = 'provider';
      }
    }

    // Pre-fill remaining fields from bundled defaults
    if (defaults) {
      if (!filled.maxContextWindowTokens && defaults.contextSize) {
        setMaxContextWindowTokens(String(defaults.contextSize));
        filled.maxContextWindowTokens = 'defaults';
      }
      if (!filled.maxOutputTokens && defaults.maxTokens) {
        setMaxOutputTokens(String(defaults.maxTokens));
        filled.maxOutputTokens = 'defaults';
      }
      if (defaults.inputCostPer1M !== undefined && !filled.inputCostPer1m) {
        setInputCostPer1m(String(defaults.inputCostPer1M));
        filled.inputCostPer1m = 'defaults';
      }
      if (defaults.outputCostPer1M !== undefined && !filled.outputCostPer1m) {
        setOutputCostPer1m(String(defaults.outputCostPer1M));
        filled.outputCostPer1m = 'defaults';
      }
      if (defaults.cachedInputCostPer1M !== undefined && !filled.cachedInputCostPer1m) {
        setCachedInputCostPer1m(String(defaults.cachedInputCostPer1M));
        filled.cachedInputCostPer1m = 'defaults';
      }
      if (defaults.supportedCapabilities?.includes('streaming') && !filled.streaming) {
        // streaming defaults to true, but mark it as pre-filled
        filled.streaming = 'defaults';
      }
      if (defaults.supportedCapabilities?.includes('vision') && !filled.vision) {
        setVision(true);
        filled.vision = 'defaults';
      }
      if (!filled.reasoningEffortMap && defaults.reasoningEffortMap) {
        // Build efforts from map keys
        const entries: Record<string, string> = {};
        for (const [key, val] of Object.entries(defaults.reasoningEffortMap)) {
          entries[key] = JSON.stringify(val);
        }
        setReasoningEffortMap(entries);
        if (Object.keys(entries).length > 0) {
          filled.reasoningEffortMap = 'defaults';
        }
        // Pre-fill default reasoning effort from defaults
        if (defaults.defaultReasoningEffort && !filled.defaultReasoningEffort) {
          setDefaultReasoningEffort(defaults.defaultReasoningEffort);
          filled.defaultReasoningEffort = 'defaults';
        }
      } else if (defaults.defaultReasoningEffort && !filled.defaultReasoningEffort) {
        setDefaultReasoningEffort(defaults.defaultReasoningEffort);
        filled.defaultReasoningEffort = 'defaults';
      }
      if (defaults.preserveReasoning !== undefined) {
        setPreserveReasoning(defaults.preserveReasoning);
        filled.preserveReasoning = 'defaults';
      }
      if (defaults.cacheControl) {
        setCacheControlEnabled(defaults.cacheControl.enabled);
        setCacheMaxMarkers(String(defaults.cacheControl.maxMarkers));
        if (defaults.cacheControl.ttl !== undefined) {
          // Legacy numeric TTL values are silently treated as undefined
          setCacheTtl('');
        }
        filled.cacheControl = 'defaults';
      }
      if (defaults.customFields) {
        const fields: CustomField[] = Object.entries(defaults.customFields).map(
          ([property, value]) => {
            const type = inferCustomFieldType(value);
            return {
              property,
              type,
              value: type === 'json' ? JSON.stringify(value) : String(value),
            };
          },
        );
        setCustomFields(fields);
        if (fields.length > 0) {
          filled.customFields = 'defaults';
        }
      }
    }

    setPrefilledFields(filled);
  }, [editingModel, fetchedModel, defaults]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const ctx = Number(maxContextWindowTokens);
    const prompt = Number(maxOutputTokens);

    if (!maxContextWindowTokens || isNaN(ctx) || ctx <= 0) {
      newErrors.maxContextWindowTokens = 'Must be a positive number';
    }
    if (!maxOutputTokens || isNaN(prompt) || prompt <= 0) {
      newErrors.maxOutputTokens = 'Must be a positive number';
    }
    if (ctx > 0 && prompt > 0 && prompt >= ctx) {
      newErrors.maxOutputTokens = 'Must be less than max context window tokens';
    }
    if (temperature !== '') {
      const t = Number(temperature);
      if (isNaN(t) || t < 0 || t > 2) {
        newErrors.temperature = 'Must be between 0 and 2';
      }
    }
    if (topP !== '') {
      const t = Number(topP);
      if (isNaN(t) || t < 0 || t > 1) {
        newErrors.topP = 'Must be between 0 and 1';
      }
    }
    if (frequencyPenalty !== '') {
      const f = Number(frequencyPenalty);
      if (isNaN(f) || f < -2 || f > 2) {
        newErrors.frequencyPenalty = 'Must be between -2 and 2';
      }
    }
    if (presencePenalty !== '') {
      const p = Number(presencePenalty);
      if (isNaN(p) || p < -2 || p > 2) {
        newErrors.presencePenalty = 'Must be between -2 and 2';
      }
    }
    for (const name of Object.keys(reasoningEffortMap)) {
      const params = reasoningEffortMap[name];
      if (params && params.trim()) {
        try {
          const parsed = JSON.parse(params);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            newErrors[`effortMap_${name}`] = 'Must be a JSON object';
          }
        } catch {
          newErrors[`effortMap_${name}`] = 'Invalid JSON';
        }
      }
    }
    if (hasCustomFieldErrors(customFields)) {
      newErrors.customFields = 'Fix custom field errors';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /** Maps error field keys to human-readable labels. */
  const fieldLabel = (field: string): string => {
    const labels: Record<string, string> = {
      maxContextWindowTokens: 'Max Context Window Tokens',
      maxOutputTokens: 'Max Output Tokens',
      temperature: 'Temperature',
      topP: 'Top P',
      frequencyPenalty: 'Frequency Penalty',
      presencePenalty: 'Presence Penalty',
      newEffortParams: 'New Effort Body Params',
      customFields: 'Custom Fields',
    };
    if (labels[field]) return labels[field];
    if (field.startsWith('effortMap_')) {
      return `Body Params for "${field.slice('effortMap_'.length)}"`;
    }
    return field;
  };

  const clearError = (field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  /** Builds the CacheControlConfig or null. */
  const buildCacheControl = (): CacheControlConfig | null => {
    if (!cacheControlEnabled) return null;
    const config: CacheControlConfig = {
      enabled: true,
      maxMarkers: Number(cacheMaxMarkers) || 4,
    };
    if (cacheTtl !== '') {
      config.ttl = cacheTtl;
    }
    return config;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    /** Builds the JSON string for reasoningEffortMap. */
    const buildReasoningEffortMapJson = (): string | null => {
      const names = Object.keys(reasoningEffortMap);
      const map: Record<string, Record<string, unknown>> = {};
      let hasEntries = false;
      for (const name of names) {
        const params = reasoningEffortMap[name];
        if (params) {
          try {
            map[name] = JSON.parse(params) as Record<string, unknown>;
            hasEntries = true;
          } catch {
            // Skip invalid JSON entries
          }
        }
      }
      return hasEntries ? JSON.stringify(map) : null;
    };

    const config: ModelConfig = {
      displayName: displayName.trim() || null,
      maxContextWindowTokens: Number(maxContextWindowTokens),
      maxOutputTokens: Number(maxOutputTokens),
      streaming,
      vision,
      temperature: temperature !== '' ? Number(temperature) : null,
      topP: topP !== '' ? Number(topP) : null,
      frequencyPenalty: frequencyPenalty !== '' ? Number(frequencyPenalty) : null,
      presencePenalty: presencePenalty !== '' ? Number(presencePenalty) : null,
      defaultReasoningEffort: defaultReasoningEffort || null,
      reasoningEffortMap: buildReasoningEffortMapJson(),
      preserveReasoning,
      inputCostPer1m: inputCostPer1m !== '' ? Number(inputCostPer1m) : null,
      outputCostPer1m: outputCostPer1m !== '' ? Number(outputCostPer1m) : null,
      cachedInputCostPer1m: cachedInputCostPer1m !== '' ? Number(cachedInputCostPer1m) : null,
      cacheControl: buildCacheControl(),
      customFields: customFields.length > 0 ? JSON.stringify(customFields) : null,
    };

    onSubmit(config);
  };

  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    onCancel();
  };

  const prefillHint = (field: string): React.JSX.Element | null => {
    const source = prefilledFields[field];
    if (!source) return null;
    const label =
      source === 'provider'
        ? 'Pre-filled from provider'
        : 'Pre-filled from known defaults for this model';
    return <small className="model-config-dialog__prefill-hint">{label}</small>;
  };

  /** Returns effort names from the reasoningEffortMap keys. */
  const effortNames = Object.keys(reasoningEffortMap);

  const addEffort = () => {
    const name = newEffortName.trim();
    if (!name || effortNames.includes(name)) return;
    const params = newEffortParams.trim();
    if (params) {
      try {
        const parsed = JSON.parse(params);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setErrors((prev) => ({ ...prev, newEffortParams: 'Must be a JSON object' }));
          return;
        }
      } catch {
        setErrors((prev) => ({ ...prev, newEffortParams: 'Invalid JSON' }));
        return;
      }
    }
    setReasoningEffortMap((prev) => ({ ...prev, [name]: params }));
    setNewEffortName('');
    setNewEffortParams('');
    clearError('newEffortParams');
  };

  const removeEffort = (name: string) => {
    setReasoningEffortMap((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (defaultReasoningEffort === name) {
      setDefaultReasoningEffort('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="model-config-dialog">
      <vscode-form-container>
        {error && <p className="model-config-dialog__error">{error}</p>}

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
            Maximum number of tokens the model can generate in a single response. Must not exceed
            the context window size.
          </vscode-form-helper>
        </FormGroup>

        <vscode-collapsible title="Advanced Settings">
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
                Stream responses token-by-token. Recommended for large requests where the response
                may take several minutes, as the connection could be dropped due to inactivity.
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
                onchange={(e: Event) =>
                  setDefaultReasoningEffort((e.target as HTMLSelectElement).value)
                }
              >
                {Object.keys(reasoningEffortMap).length === 0 && (
                  <vscode-option value="">None</vscode-option>
                )}
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
                Pass reasoning tokens from previous turns back to the model in multi-turn
                conversations. Improves coherence but increases token usage and cost.
              </vscode-form-helper>
            </FormGroup>
          </div>

          <div className="model-config-dialog__section">
            <h3 className="model-config-dialog__section-title">Caching</h3>
            {prefillHint('cacheControl')}
            <FormGroup>
              <vscode-checkbox
                checked={cacheControlEnabled || undefined}
                disabled={loading || undefined}
                onchange={() => setCacheControlEnabled(!cacheControlEnabled)}
              >
                Enable prompt caching
              </vscode-checkbox>
              <vscode-form-helper>
                Automatically inject cache_control markers to enable prompt caching on supported
                providers (e.g., Qwen via Alibaba).
              </vscode-form-helper>
            </FormGroup>
            <FormGroup>
              <Label htmlFor="cache-max-markers">Max Markers</Label>
              <Input
                id="cache-max-markers"
                type="number"
                value={cacheMaxMarkers}
                onChange={(e) => setCacheMaxMarkers(e.target.value)}
                disabled={loading || !cacheControlEnabled}
              />
              <vscode-form-helper>
                Maximum number of cache_control markers to inject per request.
              </vscode-form-helper>
            </FormGroup>
            <FormGroup>
              <Label htmlFor="cache-ttl">TTL</Label>
              <vscode-single-select
                id="cache-ttl"
                value={cacheTtl}
                disabled={loading || !cacheControlEnabled || undefined}
                onchange={(e: Event) =>
                  setCacheTtl((e.target as HTMLSelectElement).value as CacheControlTtl | '')
                }
              >
                <vscode-option value="" selected={cacheTtl === '' || undefined}>
                  None
                </vscode-option>
                <vscode-option value="5m" selected={cacheTtl === '5m' || undefined}>
                  5 minutes
                </vscode-option>
                <vscode-option value="1h" selected={cacheTtl === '1h' || undefined}>
                  1 hour
                </vscode-option>
              </vscode-single-select>
              <vscode-form-helper>
                Optional time-to-live for cached prompts. When set, markers include a ttl field.
                Select "None" to omit.
              </vscode-form-helper>
            </FormGroup>
          </div>

          <div className="model-config-dialog__section">
            <h3 className="model-config-dialog__section-title">Sampling</h3>
            <FormGroup>
              <Label htmlFor="model-temperature">Temperature</Label>
              <Input
                id="model-temperature"
                type="number"
                step="0.01"
                value={temperature}
                onChange={(e) => {
                  setTemperature(e.target.value);
                  clearError('temperature');
                }}
                errorMessage={errors.temperature}
                placeholder="0–2"
                disabled={loading}
              />
              <vscode-form-helper>
                Controls randomness. Lower values make output more focused and deterministic. Range:
                0–2.
              </vscode-form-helper>
            </FormGroup>
            <FormGroup>
              <Label htmlFor="model-top-p">Top P</Label>
              <Input
                id="model-top-p"
                type="number"
                step="0.01"
                value={topP}
                onChange={(e) => {
                  setTopP(e.target.value);
                  clearError('topP');
                }}
                errorMessage={errors.topP}
                placeholder="0–1"
                disabled={loading}
              />
              <vscode-form-helper>
                Nucleus sampling. Only tokens with cumulative probability up to this value are
                considered. Range: 0–1.
              </vscode-form-helper>
            </FormGroup>
            <FormGroup>
              <Label htmlFor="model-freq-penalty">Frequency Penalty</Label>
              <Input
                id="model-freq-penalty"
                type="number"
                step="0.01"
                value={frequencyPenalty}
                onChange={(e) => {
                  setFrequencyPenalty(e.target.value);
                  clearError('frequencyPenalty');
                }}
                errorMessage={errors.frequencyPenalty}
                placeholder="-2 to 2"
                disabled={loading}
              />
              <vscode-form-helper>
                Penalizes tokens based on how often they appear in the text so far. Reduces
                repetition. Range: -2 to 2.
              </vscode-form-helper>
            </FormGroup>
            <FormGroup>
              <Label htmlFor="model-pres-penalty">Presence Penalty</Label>
              <Input
                id="model-pres-penalty"
                type="number"
                step="0.01"
                value={presencePenalty}
                onChange={(e) => {
                  setPresencePenalty(e.target.value);
                  clearError('presencePenalty');
                }}
                errorMessage={errors.presencePenalty}
                placeholder="-2 to 2"
                disabled={loading}
              />
              <vscode-form-helper>
                Penalizes tokens based on whether they have appeared at all. Encourages topic
                diversity. Range: -2 to 2.
              </vscode-form-helper>
            </FormGroup>
          </div>

          <CustomFieldsEditor
            customFields={customFields}
            onChange={setCustomFields}
            disabled={loading}
          />

          <div className="model-config-dialog__section">
            <h3 className="model-config-dialog__section-title">Cost</h3>
            <FormGroup>
              <Label htmlFor="model-input-cost">Input Cost per 1M Tokens (USD)</Label>
              {prefillHint('inputCostPer1m')}
              <Input
                id="model-input-cost"
                type="number"
                step="any"
                value={inputCostPer1m}
                onChange={(e) => setInputCostPer1m(e.target.value)}
                disabled={loading}
              />
            </FormGroup>
            <FormGroup>
              <Label htmlFor="model-output-cost">Output Cost per 1M Tokens (USD)</Label>
              {prefillHint('outputCostPer1m')}
              <Input
                id="model-output-cost"
                type="number"
                step="any"
                value={outputCostPer1m}
                onChange={(e) => setOutputCostPer1m(e.target.value)}
                disabled={loading}
              />
            </FormGroup>
            <FormGroup>
              <Label htmlFor="model-cached-cost">Cached Input Cost per 1M Tokens (USD)</Label>
              {prefillHint('cachedInputCostPer1m')}
              <Input
                id="model-cached-cost"
                type="number"
                step="any"
                value={cachedInputCostPer1m}
                onChange={(e) => setCachedInputCostPer1m(e.target.value)}
                disabled={loading}
              />
            </FormGroup>
          </div>
        </vscode-collapsible>
        <FormGroup>
          {Object.keys(errors).length > 0 && (
            <div className="model-config-dialog__error">
              Please fix the following errors:{' '}
              {Object.keys(errors)
                .map((field) => fieldLabel(field))
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
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={loading}>
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
          onConfirm={handleConfirmCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </form>
  );
}
