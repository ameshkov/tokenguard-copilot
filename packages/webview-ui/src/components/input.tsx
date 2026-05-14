import type { InputHTMLAttributes } from 'react';

/** Props for the {@link Input} component. */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Validation error message to display below the input. */
  errorMessage?: string;
}

/**
 * A text input styled to match the VS Code design language.
 *
 * Uses VS Code CSS custom properties for colors so the input
 * automatically adapts to the active color theme.
 *
 * @param props - Standard input props plus an optional `errorMessage`.
 * @returns The input element with optional error feedback.
 */
export function Input(props: InputProps): React.JSX.Element {
  const { errorMessage, className, ...rest } = props;
  const hasError = errorMessage !== undefined && errorMessage.length > 0;
  const cls = `vscode-input${hasError ? ' vscode-input--error' : ''}${className ? ` ${className}` : ''}`;

  return (
    <div className="vscode-input-wrapper">
      <input className={cls} {...rest} />
      {hasError && <span className="vscode-input-error">{errorMessage}</span>}
    </div>
  );
}
