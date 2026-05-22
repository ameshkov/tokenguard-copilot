import type { HTMLAttributes, ReactNode } from 'react';

/** Props for the {@link FormGroup} component. */
export interface FormGroupProps extends HTMLAttributes<HTMLElement> {
  /** Form group content. */
  children?: ReactNode;
  /**
   * Layout variant.
   *
   * - `"vertical"` — label above input (default).
   * - `"horizontal"` — label beside input.
   */
  variant?: 'horizontal' | 'vertical';
}

/**
 * A wrapper that groups a label and its associated input
 * with consistent spacing.
 *
 * Renders a `<vscode-form-group>` web component from the
 * VSCode Elements library.
 *
 * @param props - Standard div HTML attributes.
 * @returns The form group container element.
 */
export function FormGroup(props: FormGroupProps): React.JSX.Element {
  const { className, children, variant = 'vertical', ...rest } = props;
  return (
    <vscode-form-group className={className} variant={variant} {...rest}>
      {children}
    </vscode-form-group>
  );
}
