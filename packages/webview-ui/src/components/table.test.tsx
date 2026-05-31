import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Table } from './table.js';

afterEach(() => {
  cleanup();
});

interface TestRow {
  id: string;
  name: string;
}

describe('Table', () => {
  it('renders column headers', () => {
    render(
      <Table<TestRow>
        columns={[{ header: 'Name', render: (r) => r.name }]}
        rows={[]}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByText('Name')).toBeDefined();
  });

  it('renders row data', () => {
    render(
      <Table<TestRow>
        columns={[{ header: 'Name', render: (r) => r.name }]}
        rows={[{ id: '1', name: 'Alice' }]}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByText('Alice')).toBeDefined();
  });

  it('renders as vscode-table element', () => {
    const { container } = render(<Table<TestRow> columns={[]} rows={[]} rowKey={(r) => r.id} />);
    expect(container.querySelector('vscode-table')).not.toBeNull();
  });

  it('assigns columnWidths as array property on the underlying element', () => {
    const { container } = render(
      <Table<TestRow>
        columns={[{ header: 'Name', render: (r) => r.name }]}
        rows={[]}
        rowKey={(r) => r.id}
        columnWidths={['50px', 'auto', '120px']}
      />,
    );
    const table = container.querySelector('vscode-table') as unknown as {
      columns?: string[];
    } | null;
    expect(table).not.toBeNull();
    expect(table?.columns).toEqual(['50px', 'auto', '120px']);
  });

  it('defaults to empty array when no columnWidths supplied', () => {
    const { container } = render(
      <Table<TestRow>
        columns={[{ header: 'Name', render: (r) => r.name }]}
        rows={[]}
        rowKey={(r) => r.id}
      />,
    );
    const table = container.querySelector('vscode-table') as unknown as {
      columns?: string[];
    } | null;
    expect(table?.columns).toEqual([]);
  });
});
