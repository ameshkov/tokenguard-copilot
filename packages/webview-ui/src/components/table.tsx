import type { ReactNode } from 'react';

/** Column definition for the {@link Table} component. */
export interface TableColumn<T> {
  /** Column header label. */
  header: string;
  /**
   * Renders the cell content for a row.
   *
   * @param row - The data item.
   * @returns Cell content.
   */
  render: (row: T) => ReactNode;
}

/** Props for the {@link Table} component. */
export interface TableProps<T> {
  /** Column definitions. */
  columns: TableColumn<T>[];
  /** Data rows. */
  rows: T[];
  /**
   * Unique key extractor for rows.
   *
   * @param row - The data item.
   * @returns A unique string key.
   */
  rowKey: (row: T) => string;
  /** CSS class name. */
  className?: string;
}

/**
 * A simple data table styled to match VS Code.
 *
 * @param props - Table props.
 * @returns The table element.
 */
export function Table<T>(props: TableProps<T>): React.JSX.Element {
  const { columns, rows, rowKey, className } = props;
  const cls = `vscode-table${className ? ` ${className}` : ''}`;

  return (
    <table className={cls}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.header}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((col) => (
              <td key={col.header}>{col.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
