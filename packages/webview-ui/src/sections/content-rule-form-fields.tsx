import { FormGroup, Input, Label } from '../components/index.js';

/**
 * Props shared by content rule form field group sub-components.
 */
export interface ContentRuleFieldsProps {
  /** Validation errors indexed by field name. */
  errors: Record<string, string>;
  /** Clears the error for the given field name. */
  clearError: (field: string) => void;
  /** Current name value. */
  name: string;
  /** Sets the name value. */
  setName: (value: string) => void;
  /** Current enabled value. */
  enabled: boolean;
  /** Sets the enabled value. */
  setEnabled: (value: boolean) => void;
  /** Current regexPattern value. */
  regexPattern: string;
  /** Sets the regexPattern value. */
  setRegexPattern: (value: string) => void;
  /** Current substitution value. */
  substitution: string;
  /** Sets the substitution value. */
  setSubstitution: (value: string) => void;
  /** Current matchRole value. */
  matchRole: string;
  /** Sets the matchRole value. */
  setMatchRole: (value: string) => void;
  /** Current matchMessageNumber value. */
  matchMessageNumber: string;
  /** Sets the matchMessageNumber value. */
  setMatchMessageNumber: (value: string) => void;
  /** Current matchModelPattern value. */
  matchModelPattern: string;
  /** Sets the matchModelPattern value. */
  setMatchModelPattern: (value: string) => void;
  /** Current matchContentPattern value. */
  matchContentPattern: string;
  /** Sets the matchContentPattern value. */
  setMatchContentPattern: (value: string) => void;
  /** Current matchToolPresent value. */
  matchToolPresent: string;
  /** Sets the matchToolPresent value. */
  setMatchToolPresent: (value: string) => void;
  /** Current matchToolAbsent value. */
  matchToolAbsent: string;
  /** Sets the matchToolAbsent value. */
  setMatchToolAbsent: (value: string) => void;
  /** Current regexFlags value. */
  regexFlags: string;
  /** Sets the regexFlags value. */
  setRegexFlags: (value: string) => void;
}

/**
 * Renders the basic settings fields: Name, Enabled, Regex Pattern,
 * Substitution.
 *
 * @param props - Field values, errors, and change handlers.
 * @returns The basic settings form groups.
 */
export function BasicSettingsFields(props: ContentRuleFieldsProps): React.JSX.Element {
  const {
    name,
    setName,
    enabled,
    setEnabled,
    regexPattern,
    setRegexPattern,
    substitution,
    setSubstitution,
    errors,
    clearError,
  } = props;

  return (
    <>
      {/* Name */}
      <FormGroup>
        <Label htmlFor="cr-name" required>
          Name
        </Label>
        <Input
          id="cr-name"
          value={name}
          placeholder="My content rule"
          invalid={!!errors.name}
          onChange={(e) => {
            setName(e.target.value);
            clearError('name');
          }}
        />
        <vscode-form-helper>
          A descriptive label for this rule. Must be unique among all content rules.
        </vscode-form-helper>
        {errors.name && <vscode-form-helper severity="error">{errors.name}</vscode-form-helper>}
      </FormGroup>

      {/* Enabled */}
      <FormGroup>
        <Label htmlFor="cr-enabled">Enabled</Label>
        <vscode-checkbox
          id="cr-enabled"
          checked={enabled}
          label="Enabled"
          name="enabled"
          onClick={() => setEnabled(!enabled)}
        />
        <vscode-form-helper>
          When enabled, this rule will be applied to matching messages during chat completion.
        </vscode-form-helper>
      </FormGroup>

      {/* Regex Pattern */}
      <FormGroup>
        <Label htmlFor="cr-regex-pattern" required>
          Regex Pattern
        </Label>
        <Input
          id="cr-regex-pattern"
          value={regexPattern}
          placeholder="<skills>[\s\S]*?</skills>"
          invalid={!!errors.regexPattern}
          onChange={(e) => {
            setRegexPattern(e.target.value);
            clearError('regexPattern');
          }}
        />
        <vscode-form-helper>
          Regular expression to find content in messages. Use <code>$1</code>, <code>$2</code>, etc.
          in the substitution to reference captured groups.
        </vscode-form-helper>
        {errors.regexPattern && (
          <vscode-form-helper severity="error">{errors.regexPattern}</vscode-form-helper>
        )}
      </FormGroup>

      {/* Substitution */}
      <FormGroup>
        <Label htmlFor="cr-substitution">Substitution</Label>
        <Input
          id="cr-substitution"
          value={substitution}
          placeholder="replacement text"
          onChange={(e) => setSubstitution(e.target.value)}
        />
        <vscode-form-helper>
          Replacement text for matched content. Leave empty to remove matched text. Use{' '}
          <code>$1</code>, <code>$2</code> to insert captured groups from the regex pattern.
        </vscode-form-helper>
      </FormGroup>
    </>
  );
}

/**
 * Renders the advanced settings fields inside a collapsible: Match Role,
 * Match Message Number, Match Model Pattern, Match Content Pattern,
 * Match Tools Present, Match Tools Absent, and Regex Flags.
 *
 * @param props - Field values, errors, and change handlers.
 * @returns The advanced settings form groups wrapped in a collapsible.
 */
export function AdvancedSettingsFields(props: ContentRuleFieldsProps): React.JSX.Element {
  const {
    matchRole,
    setMatchRole,
    matchMessageNumber,
    setMatchMessageNumber,
    matchModelPattern,
    setMatchModelPattern,
    matchContentPattern,
    setMatchContentPattern,
    matchToolPresent,
    setMatchToolPresent,
    matchToolAbsent,
    setMatchToolAbsent,
    regexFlags,
    setRegexFlags,
    errors,
    clearError,
  } = props;

  return (
    <vscode-collapsible title="Advanced Settings">
      {/* Match Role */}
      <FormGroup>
        <Label htmlFor="cr-match-role">Match Role</Label>
        <vscode-single-select
          id="cr-match-role"
          name="matchRole"
          value={matchRole}
          onchange={(e: Event) => setMatchRole((e.target as HTMLSelectElement).value)}
        >
          <vscode-option value="all">all</vscode-option>
          <vscode-option value="system">system</vscode-option>
          <vscode-option value="user">user</vscode-option>
        </vscode-single-select>
        <vscode-form-helper>
          Only apply this rule to messages with a specific role. <strong>all</strong> matches every
          message regardless of role.
        </vscode-form-helper>
      </FormGroup>

      {/* Match Message Number */}
      <FormGroup>
        <Label htmlFor="cr-match-msg-num">Match Message Number</Label>
        <Input
          id="cr-match-msg-num"
          value={matchMessageNumber}
          placeholder="e.g. 0 for the first message"
          type="text"
          invalid={!!errors.matchMessageNumber}
          onChange={(e) => {
            setMatchMessageNumber(e.target.value);
            clearError('matchMessageNumber');
          }}
        />
        <vscode-form-helper>
          Zero-based index of the message to match. Leave empty to match all messages in the
          conversation.
        </vscode-form-helper>
        {errors.matchMessageNumber && (
          <vscode-form-helper severity="error">{errors.matchMessageNumber}</vscode-form-helper>
        )}
      </FormGroup>

      {/* Match Model Pattern */}
      <FormGroup>
        <Label htmlFor="cr-match-model">Match Model Pattern</Label>
        <Input
          id="cr-match-model"
          value={matchModelPattern}
          placeholder="gpt-4*"
          onChange={(e) => setMatchModelPattern(e.target.value)}
        />
        <vscode-form-helper>
          Glob pattern to match against the model ID (e.g. <code>gpt-4*</code>). Leave empty to
          match any model.
        </vscode-form-helper>
      </FormGroup>

      {/* Match Content Pattern */}
      <FormGroup>
        <Label htmlFor="cr-match-content">Match Content Pattern</Label>
        <Input
          id="cr-match-content"
          value={matchContentPattern}
          placeholder="regex pattern"
          invalid={!!errors.matchContentPattern}
          onChange={(e) => {
            setMatchContentPattern(e.target.value);
            clearError('matchContentPattern');
          }}
        />
        <vscode-form-helper>
          Regular expression to match against message content. The rule is only applied when the
          content matches this pattern. Uses the same Regex Flags as the find-replace pattern. Leave
          empty to match any content.
        </vscode-form-helper>
        {errors.matchContentPattern && (
          <vscode-form-helper severity="error">{errors.matchContentPattern}</vscode-form-helper>
        )}
      </FormGroup>

      {/* Match Tools Present */}
      <FormGroup>
        <Label htmlFor="cr-tools-present">Match Tools Present</Label>
        <Input
          id="cr-tools-present"
          value={matchToolPresent}
          placeholder="search, code_interpreter"
          onChange={(e) => setMatchToolPresent(e.target.value)}
        />
        <vscode-form-helper>
          Comma-separated list of tool names that must ALL be present in the message. Leave empty to
          skip this filter.
        </vscode-form-helper>
      </FormGroup>

      {/* Match Tools Absent */}
      <FormGroup>
        <Label htmlFor="cr-tools-absent">Match Tools Absent</Label>
        <Input
          id="cr-tools-absent"
          value={matchToolAbsent}
          placeholder="memory"
          onChange={(e) => setMatchToolAbsent(e.target.value)}
        />
        <vscode-form-helper>
          Comma-separated list of tool names that must ALL be absent from the message. Leave empty
          to skip this filter.
        </vscode-form-helper>
      </FormGroup>

      {/* Regex Flags */}
      <FormGroup>
        <Label htmlFor="cr-regex-flags">Regex Flags</Label>
        <Input
          id="cr-regex-flags"
          value={regexFlags}
          placeholder="gm"
          invalid={!!errors.regexFlags}
          onChange={(e) => {
            setRegexFlags(e.target.value);
            clearError('regexFlags');
          }}
        />
        <vscode-form-helper>
          JavaScript regex flags for the Regex Pattern. Default is <code>gm</code> (global,
          multiline). Allowed flags: <code>g</code>, <code>i</code>, <code>m</code>, <code>s</code>.
        </vscode-form-helper>
        {errors.regexFlags && (
          <vscode-form-helper severity="error">{errors.regexFlags}</vscode-form-helper>
        )}
      </FormGroup>
    </vscode-collapsible>
  );
}
