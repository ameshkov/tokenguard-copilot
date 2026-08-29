/** A parsed Qwen model family version. */
interface QwenVersion {
  /** Major version, e.g. `3` for `qwen3.7-max`. */
  major: number;
  /** Minor version, e.g. `7` for `qwen3.7-max`. */
  minor: number;
}

/** Version boundary for the Qwen prompt-caching crutch. */
const QWEN_CACHE_MAX_VERSION = { major: 3, minor: 7 };

/**
 * Matches `qwen3.7`, `qwen3.5`, `qwen2.5`, and dial variants
 * like `qwen-3.6-max-preview`.
 */
const QWEN_DOTTED_VERSION = /qwen-?(\d+)\.(\d+)/;

/**
 * Matches major-only versions and models.dev's dropped-dot
 * convention: `qwen3-max`, `qwen3-30b-a3b-fp8`, `qwen-3-14b`,
 * `qwen35-397b-a17b` (3.5), `qwen25-vl-72b-instruct` (2.5).
 */
const QWEN_NODOT_VERSION = /qwen-?(\d{1,2})(?![.\d])/;

/** Matches the Qwen reasoning-model offshoot, e.g. `qwq-32b`. */
const QWQ_TOKEN = /qwq(?:[-.]|\b)/;

/** Matches legacy unversioned Qwen IDs, e.g. `qwen-plus`. */
const QWEN_LEGACY_TOKEN = /qwen[-.]/;

/**
 * Parses the Qwen version out of a model ID.
 *
 * Returns `null` for model IDs that are not part of the Qwen
 * family.
 *
 * @param modelId - The model identifier to inspect.
 * @returns The parsed version, or `null` when not a Qwen model.
 */
function qwenVersionOf(modelId: string): QwenVersion | null {
  const id = modelId.toLowerCase();

  const dotted = QWEN_DOTTED_VERSION.exec(id);
  if (dotted !== null) {
    return { major: Number(dotted[1]), minor: Number(dotted[2]) };
  }

  const noDot = QWEN_NODOT_VERSION.exec(id);
  if (noDot !== null) {
    const digits = noDot[1];
    if (digits.length === 1) {
      return { major: Number(digits), minor: 0 };
    }
    // models.dev drops the dot for two-digit pairs: `qwen35` is
    // Qwen 3.5, `qwen25` is Qwen 2.5.
    return { major: Number(digits[0]), minor: Number(digits[1]) };
  }

  // QwQ is the Qwen reasoning offshoot (e.g. Qwen/QwQ-32B); it
  // predates the Qwen 3.7 line and behaves like a legacy Qwen.
  // Legacy unversioned Qwen IDs (qwen-plus, qwen-max, qwen-flash)
  // are all older than 3.7 as well.
  if (QWQ_TOKEN.test(id) || QWEN_LEGACY_TOKEN.test(id)) {
    return { major: 0, minor: 0 };
  }

  return null;
}

/**
 * Returns `true` when the model ID identifies a Qwen model of
 * version 3.7 or older.
 *
 * Used to enable the prompt-caching default for Qwen models that
 * need it (older versions pair with the Alibaba
 * `enable_thinking`/`preserve_thinking` request bodies).
 *
 * @param modelId - The model identifier to inspect.
 * @returns `true` when the model is Qwen 3.7 or older, `false`
 *   otherwise.
 */
export function isQwen37OrOlder(modelId: string): boolean {
  const version = qwenVersionOf(modelId);
  if (version === null) {
    return false;
  }
  return (
    version.major < QWEN_CACHE_MAX_VERSION.major ||
    (version.major === QWEN_CACHE_MAX_VERSION.major &&
      version.minor <= QWEN_CACHE_MAX_VERSION.minor)
  );
}
