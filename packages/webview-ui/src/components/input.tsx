import type { ChangeEvent, SyntheticEvent } from 'react';

/** Props for the {@link Input} component. */
export interface InputProps {
  /** Validation error message to display below the input. */
  errorMessage?: string;
  /** Controlled value. */
  value?: string;
  /** Input type (text, number, password, etc.). */
  type?: string;
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** Placeholder text. */
  placeholder?: string;
  /** Step for number inputs. */
  step?: string;
  /** Element ID for label association. */
  id?: string;
  /** Accessible label for the input. */
  'aria-label'?: string;
  /**
   * Change handler — fires on every keystroke.
   *
   * Internally mapped to the `input` event on the
   * `<vscode-textfield>` web component so that it
   * behaves like React's native `onChange`.
   */
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A text input styled to match the VS Code design language.
 *
 * Renders a `<vscode-textfield>` web component from the
 * VSCode Elements library and displays validation errors
 * via a `<vscode-form-helper>` web component.
 *
 * @param props - Input props plus an optional
 *   `errorMessage`.
 * @returns The input element with optional error feedback.
 */
export function Input(props: InputProps): React.JSX.Element {
  const { errorMessage, onChange, ...rest } = props;
  const hasError = errorMessage !== undefined && errorMessage.length > 0;

  // Map React onChange (fire-per-keystroke) to the native
  // `input` event on the web component.
  const handleInput: React.EventHandler<SyntheticEvent<HTMLElement>> | undefined = onChange
    ? (e: SyntheticEvent<HTMLElement>) => onChange(e as unknown as ChangeEvent<HTMLInputElement>)
    : undefined;

  return (
    <>
      <vscode-textfield invalid={hasError || undefined} onInput={handleInput} {...rest} />
      {hasError && <vscode-form-helper severity="error">{errorMessage}</vscode-form-helper>}
    </>
  );
}
