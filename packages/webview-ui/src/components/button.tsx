import type { ButtonHTMLAttributes } from 'react';

/** Props for the {@link Button} component. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant of the button.
   *
   * - `"primary"` — filled background (default).
   * - `"secondary"` — outlined / subdued style.
   */
  variant?: 'primary' | 'secondary';
}

/**
 * A button styled to match the VS Code design language.
 *
 * Uses VS Code CSS custom properties for colors so the button
 * automatically adapts to the active color theme.
 *
 * @param props - Standard button props plus an optional `variant`.
 * @returns The button element.
 */
export function Button(props: ButtonProps): React.JSX.Element {
  const { variant = 'primary', className, ...rest } = props;
  const cls = `vscode-button vscode-button--${variant}${className ? ` ${className}` : ''}`;
  return <button className={cls} {...rest} />;
}
