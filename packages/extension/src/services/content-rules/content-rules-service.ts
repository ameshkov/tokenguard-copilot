import type { Logger } from '../../logger/index.js';
import type { ContentRulesRepository } from '../../repositories/index.js';
import type { ContentRule, NewContentRule } from '../../db/index.js';
import type { OpenAIMessage } from '../chat-handler/index.js';
import { truncate } from '../../utils/index.js';
import { safeParseJsonArray } from '../../utils/index.js';

/**
 * Input type for creating a new content rule.
 *
 * Excludes server-generated fields (id, sortOrder,
 * createdAt, updatedAt) that are computed by the
 * service. Tool arrays are serialized to JSON strings
 * before storage.
 */
export interface CreateContentRuleInput {
  name: string;
  enabled?: number;
  matchRole?: string | null;
  matchMessageNumber?: number | null;
  matchModelPattern?: string | null;
  matchContentPattern?: string | null;
  matchToolPresent?: string[] | null;
  matchToolAbsent?: string[] | null;
  regexPattern: string;
  regexFlags?: string;
  substitution: string;
}

/**
 * Input type for updating an existing content rule.
 *
 * All fields are optional — only provided fields are
 * updated. Server-generated fields (id, sortOrder,
 * createdAt, updatedAt) are excluded. Tool arrays are
 * serialized to JSON strings before storage.
 */
export interface UpdateContentRuleInput {
  name?: string;
  enabled?: number;
  matchRole?: string | null;
  matchMessageNumber?: number | null;
  matchModelPattern?: string | null;
  matchContentPattern?: string | null;
  matchToolPresent?: string[] | null;
  matchToolAbsent?: string[] | null;
  regexPattern?: string;
  regexFlags?: string;
  substitution?: string;
}

/**
 * Records whether a content rule matched any message and
 * whether its regex replace changed any content.
 */
export interface RuleApplicationResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  applied: boolean;
  errored: boolean;
}

/**
 * Applies content rules to OpenAI-format chat messages.
 *
 * Rules are loaded from the repository, filtered to enabled
 * only, and applied sequentially to system and user messages
 * that appear before the first assistant response.
 */
export class ContentRulesService {
  /**
   * Creates a new ContentRulesService.
   *
   * @param repo - Data-access layer for content rules.
   * @param logger - Logger for runtime diagnostics.
   */
  constructor(
    private readonly repo: ContentRulesRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Applies enabled content rules to the given messages.
   *
   * @param messages - OpenAI-format messages to transform.
   * @param modelId - The model ID being used (for
   *   matchModelPattern).
   * @param toolNames - Names of tools available in the
   *   request.
   * @returns Transformed messages and per-rule results.
   */
  applyRules(
    messages: OpenAIMessage[],
    modelId: string,
    toolNames: string[],
  ): { messages: OpenAIMessage[]; ruleResults: RuleApplicationResult[] } {
    const rules = this.repo.findAll().filter((r) => r.enabled === 1);
    const ruleResults: RuleApplicationResult[] = [];

    this.logger.trace(`Applying ${rules.length} enabled rules to ${messages.length} messages`);

    // Find boundary: first assistant message
    const firstAssistantIndex = messages.findIndex((m) => m.role === 'assistant');
    const eligibleEnd = firstAssistantIndex === -1 ? messages.length : firstAssistantIndex;

    this.logger.trace(
      `First assistant at index ${firstAssistantIndex}, eligible messages up to ${eligibleEnd}`,
    );

    const transformed = messages.map((m) => ({ ...m }));

    for (const rule of rules) {
      this.logger.trace(`Processing rule "${rule.name}"`);

      let ruleMatched = false;
      let ruleApplied = false;
      let ruleErrored = false;

      for (let i = 0; i < eligibleEnd; i++) {
        const msg = transformed[i];

        // Skip non-string content (array content with images)
        if (typeof msg.content !== 'string') {
          continue;
        }

        // Check role filter (null normalised to 'all' for backward compatibility)
        const effectiveRole = rule.matchRole ?? 'all';
        if (effectiveRole !== 'all' && msg.role !== effectiveRole) {
          continue;
        }

        // Check message number filter
        if (rule.matchMessageNumber !== null && i !== rule.matchMessageNumber) {
          continue;
        }

        // Check model pattern filter
        if (rule.matchModelPattern !== null) {
          if (!matchWildcard(modelId, rule.matchModelPattern)) {
            continue;
          }
        }

        // Check content pattern filter
        if (rule.matchContentPattern !== null) {
          try {
            const contentRegex = new RegExp(rule.matchContentPattern, rule.regexFlags);
            if (!contentRegex.test(msg.content)) {
              continue;
            }
          } catch {
            this.logger.warn(
              `Content rule "${rule.name}" has an invalid matchContentPattern, skipping`,
            );
            // Invalid matchContentPattern — skip silently
            continue;
          }
        }

        // Check tool presence filter (AND logic)
        if (rule.matchToolPresent !== null && rule.matchToolPresent !== '') {
          const requiredTools = safeParseJsonArray(rule.matchToolPresent);
          if (requiredTools.length > 0 && !requiredTools.every((t) => toolNames.includes(t))) {
            continue;
          }
        }

        // Check tool absence filter (AND logic)
        if (rule.matchToolAbsent !== null && rule.matchToolAbsent !== '') {
          const absentTools = safeParseJsonArray(rule.matchToolAbsent);
          if (absentTools.length > 0 && !absentTools.every((t) => !toolNames.includes(t))) {
            continue;
          }
        }

        // All criteria passed — this rule matches at least one message
        ruleMatched = true;

        // Apply regex replace
        try {
          const searchRegex = new RegExp(rule.regexPattern, rule.regexFlags);
          const newContent = msg.content.replace(searchRegex, rule.substitution);
          if (newContent !== msg.content) {
            ruleApplied = true;
            this.logger.debug(
              `Rule "${rule.name}" transformed message [${i}]: "${truncate(msg.content, 80)}"`,
            );
            transformed[i] = { ...msg, content: newContent };
            // Update local reference for sequential rules
            msg.content = newContent;
          }
        } catch {
          this.logger.warn(`Content rule "${rule.name}" has an invalid regex pattern, skipping`);
          ruleErrored = true;
        }
      }

      this.logger.trace(
        `Rule "${rule.name}" result: matched=${ruleMatched} applied=${ruleApplied} errored=${ruleErrored}`,
      );

      ruleResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matched: ruleMatched,
        applied: ruleApplied,
        errored: ruleErrored,
      });
    }

    return { messages: transformed, ruleResults };
  }

  /**
   * Returns all content rules ordered by sortOrder.
   *
   * @returns Array of all content rule rows.
   */
  getAll(): ContentRule[] {
    return this.repo.findAll();
  }

  /**
   * Finds a content rule by ID.
   *
   * @param id - The rule ID.
   * @returns The content rule or undefined.
   */
  getById(id: string): ContentRule | undefined {
    return this.repo.findById(id);
  }

  /**
   * Creates a new content rule.
   *
   * Server-generated fields (id, sortOrder, createdAt,
   * updatedAt) are computed automatically. The new rule is
   * appended at the end of the ordered list.
   *
   * @param rule - The rule data (without id, sortOrder,
   *   or timestamps).
   * @returns The created content rule.
   */
  create(rule: CreateContentRuleInput): ContentRule {
    const existingRules = this.repo.findAll();
    const maxSortOrder =
      existingRules.length > 0 ? Math.max(...existingRules.map((r) => r.sortOrder)) : -1;
    const now = new Date().toISOString();
    return this.repo.insert({
      ...rule,
      enabled: rule.enabled ?? 1,
      matchToolPresent:
        rule.matchToolPresent && rule.matchToolPresent.length > 0
          ? JSON.stringify(rule.matchToolPresent)
          : null,
      matchToolAbsent:
        rule.matchToolAbsent && rule.matchToolAbsent.length > 0
          ? JSON.stringify(rule.matchToolAbsent)
          : null,
      id: crypto.randomUUID(),
      sortOrder: maxSortOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Updates mutable fields of a content rule.
   *
   * Tool arrays are serialized to JSON strings before
   * storage. `updatedAt` is refreshed automatically by
   * the repository layer.
   *
   * @param id - The rule ID.
   * @param changes - Fields to update.
   * @returns The updated rule or undefined.
   */
  update(id: string, changes: UpdateContentRuleInput): ContentRule | undefined {
    const serialized: Record<string, unknown> = { ...changes };
    if (changes.matchToolPresent !== undefined) {
      serialized.matchToolPresent =
        changes.matchToolPresent && changes.matchToolPresent.length > 0
          ? JSON.stringify(changes.matchToolPresent)
          : null;
    }
    if (changes.matchToolAbsent !== undefined) {
      serialized.matchToolAbsent =
        changes.matchToolAbsent && changes.matchToolAbsent.length > 0
          ? JSON.stringify(changes.matchToolAbsent)
          : null;
    }
    return this.repo.update(id, serialized as Partial<NewContentRule>);
  }

  /**
   * Deletes a content rule by ID.
   *
   * @param id - The rule ID.
   * @returns True if deleted, false if not found.
   */
  delete(id: string): boolean {
    return this.repo.delete(id);
  }

  /**
   * Reorders content rules by assigning new sortOrder values.
   *
   * @param orderedIds - Rule IDs in the desired order.
   */
  reorder(orderedIds: string[]): void {
    this.repo.reorder(orderedIds);
  }

  /**
   * Checks whether a content rule with the given name exists.
   *
   * @param name - The name to check.
   * @param excludeId - Optional ID to exclude from check.
   * @returns True if a rule with the name exists.
   */
  validateName(name: string, excludeId?: string): boolean {
    return this.repo.nameExists(name, excludeId);
  }
}

/**
 * Matches a string against a simple wildcard pattern.
 *
 * `*` matches any sequence of characters (including empty).
 * `?` matches exactly one character.
 *
 * @param value - The string to test.
 * @param pattern - The wildcard pattern.
 * @returns True if the value matches the pattern.
 */
function matchWildcard(value: string, pattern: string): boolean {
  // Escape regex special characters except * and ?
  let regexStr = '';
  for (const ch of pattern) {
    switch (ch) {
      case '*':
        regexStr += '.*';
        break;
      case '?':
        regexStr += '.';
        break;
      case '.':
      case '(':
      case ')':
      case '[':
      case ']':
      case '{':
      case '}':
      case '+':
      case '^':
      case '$':
      case '|':
      case '\\':
        regexStr += '\\' + ch;
        break;
      default:
        regexStr += ch;
    }
  }
  return new RegExp(`^${regexStr}$`).test(value);
}
