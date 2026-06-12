import type { CacheControlTtl } from '@tokenguard/shared';
import { FormGroup, Input, Label } from '../../components/index.js';

/** Props shared by all model config advanced section sub-components. */
interface SectionBaseProps {
  /** Returns a pre-fill hint element, or null. */
  prefillHint: (field: string) => React.JSX.Element | null;
  /** Whether all inputs should be disabled. */
  loading: boolean;
}

// ──────────────────── Caching ────────────────────

/** Props for {@link ModelConfigCachingSection}. */
export interface ModelConfigCachingSectionProps extends SectionBaseProps {
  cacheControlEnabled: boolean;
  cacheMaxMarkers: string;
  cacheTtl: CacheControlTtl | '';
  setCacheControlEnabled: (v: boolean) => void;
  setCacheMaxMarkers: (v: string) => void;
  setCacheTtl: (v: CacheControlTtl | '') => void;
}

/**
 * Prompt caching checkbox, max markers, and TTL selector.
 *
 * @param props - Section props.
 * @returns The caching section.
 */
export function ModelConfigCachingSection(
  props: ModelConfigCachingSectionProps,
): React.JSX.Element {
  const {
    cacheControlEnabled,
    cacheMaxMarkers,
    cacheTtl,
    loading,
    prefillHint,
    setCacheControlEnabled,
    setCacheMaxMarkers,
    setCacheTtl,
  } = props;

  return (
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
          Automatically inject cache_control markers to enable prompt caching on supported providers
          (e.g., Qwen via Alibaba).
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
          Optional time-to-live for cached prompts. When set, markers include a ttl field. Select
          "None" to omit.
        </vscode-form-helper>
      </FormGroup>
    </div>
  );
}

// ──────────────────── Sampling ────────────────────

/** Props for {@link ModelConfigSamplingSection}. */
export interface ModelConfigSamplingSectionProps extends SectionBaseProps {
  temperature: string;
  topP: string;
  frequencyPenalty: string;
  presencePenalty: string;
  errors: Record<string, string>;
  setTemperature: (v: string) => void;
  setTopP: (v: string) => void;
  setFrequencyPenalty: (v: string) => void;
  setPresencePenalty: (v: string) => void;
  clearError: (field: string) => void;
}

/**
 * Temperature, Top P, Frequency Penalty, Presence Penalty inputs.
 *
 * @param props - Section props.
 * @returns The sampling section.
 */
export function ModelConfigSamplingSection(
  props: ModelConfigSamplingSectionProps,
): React.JSX.Element {
  const {
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    errors,
    loading,
    setTemperature,
    setTopP,
    setFrequencyPenalty,
    setPresencePenalty,
    clearError,
  } = props;

  return (
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
          Controls randomness. Lower values make output more focused and deterministic. Range: 0–2.
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
          Nucleus sampling. Only tokens with cumulative probability up to this value are considered.
          Range: 0–1.
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
          Penalizes tokens based on how often they appear in the text so far. Reduces repetition.
          Range: -2 to 2.
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
          Penalizes tokens based on whether they have appeared at all. Encourages topic diversity.
          Range: -2 to 2.
        </vscode-form-helper>
      </FormGroup>
    </div>
  );
}

// ──────────────────── Cost ────────────────────

/** Props for {@link ModelConfigCostSection}. */
export interface ModelConfigCostSectionProps extends SectionBaseProps {
  inputCostPer1m: string;
  outputCostPer1m: string;
  cachedInputCostPer1m: string;
  setInputCostPer1m: (v: string) => void;
  setOutputCostPer1m: (v: string) => void;
  setCachedInputCostPer1m: (v: string) => void;
}

/**
 * Per-token cost inputs.
 *
 * @param props - Section props.
 * @returns The cost section.
 */
export function ModelConfigCostSection(props: ModelConfigCostSectionProps): React.JSX.Element {
  const {
    inputCostPer1m,
    outputCostPer1m,
    cachedInputCostPer1m,
    loading,
    prefillHint,
    setInputCostPer1m,
    setOutputCostPer1m,
    setCachedInputCostPer1m,
  } = props;

  return (
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
  );
}
