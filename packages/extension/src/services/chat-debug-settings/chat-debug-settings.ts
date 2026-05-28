import type { SettingsRepository } from '../../repositories/index.js';

/** Chat debug configuration values. */
export interface ChatDebugSettings {
  /** Whether debug logging is active. */
  enabled: boolean;
  /** Hours before logs are eligible for cleanup. */
  ttlHours: number;
}

const SETTING_ENABLED = 'chatDebug.enabled';
const SETTING_TTL_HOURS = 'chatDebug.ttlHours';

const DEFAULT_ENABLED = false;
const DEFAULT_TTL_HOURS = 24;

/**
 * Manages chat debug configuration (enabled flag, TTL).
 *
 * Reads and writes settings via the generic
 * {@link SettingsRepository}. Provides typed access with
 * defaults and validation.
 */
export class ChatDebugSettingsService {
  /**
   * Creates a new ChatDebugSettingsService.
   *
   * @param settingsRepo - Repository for key-value settings
   *   storage.
   */
  constructor(private readonly settingsRepo: SettingsRepository) {}

  /**
   * Returns the current chat debug settings, falling back to
   * defaults for any unset values.
   *
   * @returns The current chat debug settings.
   */
  getSettings(): ChatDebugSettings {
    const enabledRaw = this.settingsRepo.get(SETTING_ENABLED);
    const ttlRaw = this.settingsRepo.get(SETTING_TTL_HOURS);

    return {
      enabled: enabledRaw === 'true' ? true : DEFAULT_ENABLED,
      ttlHours:
        ttlRaw !== null
          ? (() => {
              const parsed = parseInt(ttlRaw, 10);
              return Number.isNaN(parsed) ? DEFAULT_TTL_HOURS : parsed;
            })()
          : DEFAULT_TTL_HOURS,
    };
  }

  /**
   * Updates chat debug settings. Only provided fields are
   * changed; omitted fields retain their current values.
   *
   * @param partial - Fields to update.
   * @returns The complete settings after the update.
   * @throws Error if `ttlHours` is less than 1 or not a whole
   *   number.
   */
  updateSettings(partial: Partial<ChatDebugSettings>): ChatDebugSettings {
    if (partial.ttlHours !== undefined) {
      if (!Number.isInteger(partial.ttlHours)) {
        throw new Error('ttlHours must be a whole number');
      }
      if (partial.ttlHours < 1) {
        throw new Error('ttlHours must be at least 1');
      }
    }

    if (partial.enabled !== undefined) {
      this.settingsRepo.set(SETTING_ENABLED, String(partial.enabled));
    }

    if (partial.ttlHours !== undefined) {
      this.settingsRepo.set(SETTING_TTL_HOURS, String(partial.ttlHours));
    }

    return this.getSettings();
  }
}
