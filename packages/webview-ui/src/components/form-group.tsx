import type { HTMLAttributes } from 'react';

/**
 * A wrapper that groups a label and its associated input with
 * consistent spacing.
 *
 * @param props - Standard div HTML attributes.
 * @returns The form group container element.
 */
export function FormGroup(props: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const { className, ...rest } = props;
  const cls = `vscode-form-group${className ? ` ${className}` : ''}`;
  return <div className={cls} {...rest} />;
}
