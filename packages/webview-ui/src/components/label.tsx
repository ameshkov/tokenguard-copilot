import type { LabelHTMLAttributes } from 'react';

/**
 * A label styled to match the VS Code design language.
 *
 * Uses VS Code CSS custom properties for colors so the label
 * automatically adapts to the active color theme.
 *
 * @param props - Standard label HTML attributes.
 * @returns The label element.
 */
export function Label(props: LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  const { className, ...rest } = props;
  const cls = `vscode-label${className ? ` ${className}` : ''}`;
  return <label className={cls} {...rest} />;
}
