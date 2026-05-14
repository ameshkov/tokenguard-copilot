import type { HTMLAttributes } from 'react';

/** Props for the {@link SectionHeader} component. */
export interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** The section title text. */
  title: string;
}

/**
 * A section header with a horizontal rule and title.
 *
 * @param props - Header props.
 * @returns The section header element.
 */
export function SectionHeader(props: SectionHeaderProps): React.JSX.Element {
  const { title, className, ...rest } = props;
  const cls = `section-header${className ? ` ${className}` : ''}`;
  return (
    <div className={cls} {...rest}>
      <h2 className="section-header__title">{title}</h2>
    </div>
  );
}
