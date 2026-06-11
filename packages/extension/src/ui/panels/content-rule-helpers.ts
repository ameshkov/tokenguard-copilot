import type { ContentRuleInfo } from '@tokenguard/shared';
import type { ContentRule } from '../../db/index.js';
import { safeParseJsonArray } from '../../utils/index.js';

/**
 * Converts a DB content rule row to the webview-friendly
 * {@link ContentRuleInfo} shape.
 *
 * @param rule - The DB content rule row.
 * @returns The content rule info for the webview.
 */
export function toContentRuleInfo(rule: ContentRule): ContentRuleInfo {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled === 1,
    matchRole: (rule.matchRole as 'system' | 'user' | 'all' | undefined) ?? 'all',
    matchMessageNumber: rule.matchMessageNumber,
    matchModelPattern: rule.matchModelPattern,
    matchContentPattern: rule.matchContentPattern,
    matchToolPresent:
      rule.matchToolPresent === null ? null : safeParseJsonArray(rule.matchToolPresent),
    matchToolAbsent:
      rule.matchToolAbsent === null ? null : safeParseJsonArray(rule.matchToolAbsent),
    regexPattern: rule.regexPattern,
    regexFlags: rule.regexFlags,
    substitution: rule.substitution,
    sortOrder: rule.sortOrder,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

/**
 * Validates content rule parameters.
 *
 * @param params - The rule parameters to validate.
 * @param existingName - Function to check if a name already
 *   exists (receives name and optional exclude ID).
 * @param excludeId - Optional rule ID to exclude from name
 *   uniqueness check (for updates).
 * @returns An error message string, or null if valid.
 */
export function validateContentRuleParams(
  params: {
    name: string;
    regexPattern: string;
    regexFlags: string;
    matchRole?: string;
    matchMessageNumber?: number | null;
    matchContentPattern?: string | null;
  },
  existingName: (name: string, excludeId?: string) => boolean,
  excludeId?: string,
): string | null {
  if (!params.name || params.name.trim().length === 0) {
    return 'Name is required.';
  }
  if (existingName(params.name.trim(), excludeId)) {
    return `A content rule with the name "${params.name.trim()}" already exists.`;
  }
  try {
    new RegExp(params.regexPattern);
  } catch {
    return 'Invalid regex pattern.';
  }
  if (!/^[gims]*$/.test(params.regexFlags)) {
    return 'Invalid regex flags. Only g, i, m, s are allowed.';
  }
  if (params.matchRole != null && !['system', 'user', 'all'].includes(params.matchRole)) {
    return 'Match role must be "system", "user", or "all".';
  }
  if (params.matchMessageNumber != null) {
    if (
      typeof params.matchMessageNumber !== 'number' ||
      !Number.isInteger(params.matchMessageNumber) ||
      params.matchMessageNumber < 0
    ) {
      return 'Match message number must be a non-negative integer.';
    }
  }
  if (params.matchContentPattern != null && params.matchContentPattern.length > 0) {
    try {
      new RegExp(params.matchContentPattern, params.regexFlags);
    } catch {
      return 'Invalid match content pattern.';
    }
  }
  return null;
}
