import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BasicSettingsFields,
  AdvancedSettingsFields,
  type ContentRuleFieldsProps,
} from './content-rule-form-fields.js';

afterEach(() => {
  cleanup();
});

/** Builds a minimal ContentRuleFieldsProps with all vi.fn() defaults. */
function buildProps(overrides: Partial<ContentRuleFieldsProps> = {}): ContentRuleFieldsProps {
  return {
    errors: {},
    clearError: vi.fn(),
    name: '',
    setName: vi.fn(),
    enabled: true,
    setEnabled: vi.fn(),
    regexPattern: '',
    setRegexPattern: vi.fn(),
    substitution: '',
    setSubstitution: vi.fn(),
    matchRole: 'all',
    setMatchRole: vi.fn(),
    matchMessageNumber: '',
    setMatchMessageNumber: vi.fn(),
    matchModelPattern: '',
    setMatchModelPattern: vi.fn(),
    matchContentPattern: '',
    setMatchContentPattern: vi.fn(),
    matchToolPresent: '',
    setMatchToolPresent: vi.fn(),
    matchToolAbsent: '',
    setMatchToolAbsent: vi.fn(),
    regexFlags: 'gm',
    setRegexFlags: vi.fn(),
    ...overrides,
  };
}

describe('BasicSettingsFields', () => {
  it('renders Name, Enabled, Regex Pattern, and Substitution fields', () => {
    render(<BasicSettingsFields {...buildProps()} />);

    expect(screen.getByLabelText('Name')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Enabled' })).toBeDefined();
    expect(screen.getByLabelText('Regex Pattern')).toBeDefined();
    expect(screen.getByLabelText('Substitution')).toBeDefined();
  });

  it('renders field values from props', () => {
    render(
      <BasicSettingsFields
        {...buildProps({
          name: 'My Rule',
          enabled: true,
          regexPattern: 'test',
          substitution: 'replaced',
        })}
      />,
    );

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('My Rule');
    expect(screen.getByRole('checkbox', { name: 'Enabled' })).toHaveProperty('checked', true);
    expect((screen.getByLabelText('Regex Pattern') as HTMLInputElement).value).toBe('test');
    expect((screen.getByLabelText('Substitution') as HTMLInputElement).value).toBe('replaced');
  });

  it('shows name error when errors.name is set', () => {
    render(<BasicSettingsFields {...buildProps({ errors: { name: 'Name is required' } })} />);

    expect(screen.getByText('Name is required')).toBeDefined();
  });

  it('shows regexPattern error when errors.regexPattern is set', () => {
    render(
      <BasicSettingsFields
        {...buildProps({
          errors: { regexPattern: 'Invalid regex pattern' },
        })}
      />,
    );

    expect(screen.getByText('Invalid regex pattern')).toBeDefined();
  });

  it('calls setName and clearError on name input change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<BasicSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Name'), 'T');

    expect(props.setName).toHaveBeenCalled();
    expect(props.clearError).toHaveBeenCalledWith('name');
  });

  it('calls setRegexPattern and clearError on regex pattern change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<BasicSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Regex Pattern'), 't');

    expect(props.setRegexPattern).toHaveBeenCalled();
    expect(props.clearError).toHaveBeenCalledWith('regexPattern');
  });

  it('calls setEnabled when checkbox is clicked', async () => {
    const user = userEvent.setup();
    const props = buildProps({ enabled: true });

    render(<BasicSettingsFields {...props} />);

    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }));

    expect(props.setEnabled).toHaveBeenCalledWith(false);
  });

  it('calls setSubstitution on substitution input change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<BasicSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Substitution'), 'x');

    expect(props.setSubstitution).toHaveBeenCalled();
  });
});

describe('AdvancedSettingsFields', () => {
  it('renders all advanced fields', () => {
    render(<AdvancedSettingsFields {...buildProps()} />);

    // vscode-collapsible uses a title attribute that mocks don't
    // render as text; check for the collapsible element via a CSS
    // selector and verify all enclosed fields are present.
    const collapsible = document.querySelector('vscode-collapsible');
    expect(collapsible).toBeDefined();
    expect(collapsible!.getAttribute('title')).toBe('Advanced Settings');

    expect(screen.getByText('Match Role')).toBeDefined();
    expect(screen.getByLabelText('Match Message Number')).toBeDefined();
    expect(screen.getByLabelText('Match Model Pattern')).toBeDefined();
    expect(screen.getByLabelText('Match Content Pattern')).toBeDefined();
    expect(screen.getByLabelText('Match Tools Present')).toBeDefined();
    expect(screen.getByLabelText('Match Tools Absent')).toBeDefined();
    expect(screen.getByLabelText('Regex Flags')).toBeDefined();
  });

  it('renders field values from props', () => {
    render(
      <AdvancedSettingsFields
        {...buildProps({
          matchRole: 'system',
          matchMessageNumber: '0',
          matchModelPattern: 'gpt-4*',
          matchContentPattern: 'skills',
          matchToolPresent: 'search',
          matchToolAbsent: 'memory',
          regexFlags: 'gi',
        })}
      />,
    );

    expect((screen.getByLabelText('Match Message Number') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Match Model Pattern') as HTMLInputElement).value).toBe('gpt-4*');
    expect((screen.getByLabelText('Match Content Pattern') as HTMLInputElement).value).toBe(
      'skills',
    );
    expect((screen.getByLabelText('Match Tools Present') as HTMLInputElement).value).toBe('search');
    expect((screen.getByLabelText('Match Tools Absent') as HTMLInputElement).value).toBe('memory');
    expect((screen.getByLabelText('Regex Flags') as HTMLInputElement).value).toBe('gi');
  });

  it('shows matchMessageNumber error', () => {
    render(
      <AdvancedSettingsFields
        {...buildProps({
          errors: { matchMessageNumber: 'Must be a non-negative integer' },
        })}
      />,
    );

    expect(screen.getByText('Must be a non-negative integer')).toBeDefined();
  });

  it('shows matchContentPattern error', () => {
    render(
      <AdvancedSettingsFields
        {...buildProps({
          errors: { matchContentPattern: 'Invalid match content pattern' },
        })}
      />,
    );

    expect(screen.getByText('Invalid match content pattern')).toBeDefined();
  });

  it('shows regexFlags error', () => {
    render(
      <AdvancedSettingsFields
        {...buildProps({
          errors: { regexFlags: 'Invalid regex flags' },
        })}
      />,
    );

    expect(screen.getByText('Invalid regex flags')).toBeDefined();
  });

  it('calls setMatchMessageNumber and clearError on change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<AdvancedSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Match Message Number'), '1');

    expect(props.setMatchMessageNumber).toHaveBeenCalled();
    expect(props.clearError).toHaveBeenCalledWith('matchMessageNumber');
  });

  it('calls setMatchModelPattern on change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<AdvancedSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Match Model Pattern'), 'g');

    expect(props.setMatchModelPattern).toHaveBeenCalled();
  });

  it('calls setMatchContentPattern and clearError on change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<AdvancedSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Match Content Pattern'), 'r');

    expect(props.setMatchContentPattern).toHaveBeenCalled();
    expect(props.clearError).toHaveBeenCalledWith('matchContentPattern');
  });

  it('calls setMatchToolPresent on change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<AdvancedSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Match Tools Present'), 's');

    expect(props.setMatchToolPresent).toHaveBeenCalled();
  });

  it('calls setMatchToolAbsent on change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<AdvancedSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Match Tools Absent'), 'm');

    expect(props.setMatchToolAbsent).toHaveBeenCalled();
  });

  it('calls setRegexFlags and clearError on change', async () => {
    const user = userEvent.setup();
    const props = buildProps();

    render(<AdvancedSettingsFields {...props} />);

    await user.type(screen.getByLabelText('Regex Flags'), 'i');

    expect(props.setRegexFlags).toHaveBeenCalled();
    expect(props.clearError).toHaveBeenCalledWith('regexFlags');
  });
});
