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

  it('applies default class name', () => {
    const { container } = render(<Table<TestRow> columns={[]} rows={[]} rowKey={(r) => r.id} />);
    expect(container.querySelector('.vscode-table')).not.toBeNull();
  });
});
