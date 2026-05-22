import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../vscode-api.js', () => ({
  sendRequest: vi.fn(),
}));

import { ChatDebugSection } from './chat-debug-section.js';
import { sendRequest } from '../vscode-api.js';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendRequest).mockResolvedValue({
    type: 'getChatDebugSettingsResult',
    requestId: 'r1',
    settings: { enabled: false, ttlHours: 24 },
  });
});

describe('ChatDebugSection', () => {
  it('renders section header', async () => {
    render(<ChatDebugSection />);
    await waitFor(() => {
      expect(screen.getByText('Chat Debug')).toBeDefined();
    });
  });

  it('renders description text', async () => {
    render(<ChatDebugSection />);
    await waitFor(() => {
      expect(screen.getByText(/logs all model requests/)).toBeDefined();
    });
  });

  it('fetches settings on mount', async () => {
    render(<ChatDebugSection />);
    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith({
        type: 'getChatDebugSettings',
      });
    });
  });

  it('renders enabled checkbox unchecked by default', async () => {
    render(<ChatDebugSection />);
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox', {
        name: 'Enabled',
      });
      expect(checkbox).toHaveProperty('checked', false);
    });
  });

  it('renders TTL input with default value', async () => {
    render(<ChatDebugSection />);
    await waitFor(() => {
      const input = screen.getByLabelText('Time-to-live (hours)');
      expect(input).toHaveProperty('value', '24');
    });
  });

  it('toggles enabled and sends update', async () => {
    vi.mocked(sendRequest)
      .mockResolvedValueOnce({
        type: 'getChatDebugSettingsResult',
        requestId: 'r1',
        settings: { enabled: false, ttlHours: 24 },
      })
      .mockResolvedValueOnce({
        type: 'updateChatDebugSettingsResult',
        requestId: 'r2',
        success: true,
        settings: { enabled: true, ttlHours: 24 },
      });

    const user = userEvent.setup();
    render(<ChatDebugSection />);

    await waitFor(() => {
      screen.getByRole('checkbox', { name: 'Enabled' });
    });

    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }));

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith({
        type: 'updateChatDebugSettings',
        enabled: true,
      });
    });
  });

  it('updates TTL on blur and sends update', async () => {
    vi.mocked(sendRequest)
      .mockResolvedValueOnce({
        type: 'getChatDebugSettingsResult',
        requestId: 'r1',
        settings: { enabled: false, ttlHours: 24 },
      })
      .mockResolvedValueOnce({
        type: 'updateChatDebugSettingsResult',
        requestId: 'r2',
        success: true,
        settings: { enabled: false, ttlHours: 12 },
      });

    const user = userEvent.setup();
    render(<ChatDebugSection />);

    await waitFor(() => {
      screen.getByLabelText('Time-to-live (hours)');
    });

    const input = screen.getByLabelText('Time-to-live (hours)');
    await user.clear(input);
    await user.type(input, '12');
    await user.tab();

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith({
        type: 'updateChatDebugSettings',
        ttlHours: 12,
      });
    });
  });

  it('renders Clear logs button', async () => {
    render(<ChatDebugSection />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Clear Logs',
        }),
      ).toBeDefined();
    });
  });

  it('sends clearChatDebugLogs after confirmation', async () => {
    vi.mocked(sendRequest)
      .mockResolvedValueOnce({
        type: 'getChatDebugSettingsResult',
        requestId: 'r1',
        settings: { enabled: false, ttlHours: 24 },
      })
      .mockResolvedValueOnce({
        type: 'clearChatDebugLogsResult',
        requestId: 'r2',
        success: true,
      });

    const user = userEvent.setup();
    render(<ChatDebugSection />);

    await waitFor(() => {
      screen.getByRole('button', {
        name: 'Clear Logs',
      });
    });

    await user.click(
      screen.getByRole('button', {
        name: 'Clear Logs',
      }),
    );

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText(/permanently delete all debug logs/)).toBeDefined();
    });

    // Confirm the action — find the confirm button inside
    // the dialog (the second "Clear Logs" button).
    const clearButtons = screen.getAllByRole('button', {
      name: 'Clear Logs',
    });
    await user.click(clearButtons[clearButtons.length - 1]);

    await waitFor(() => {
      expect(sendRequest).toHaveBeenCalledWith({
        type: 'clearChatDebugLogs',
      });
    });
  });

  it('shows error when update fails', async () => {
    vi.mocked(sendRequest)
      .mockResolvedValueOnce({
        type: 'getChatDebugSettingsResult',
        requestId: 'r1',
        settings: { enabled: false, ttlHours: 24 },
      })
      .mockResolvedValueOnce({
        type: 'updateChatDebugSettingsResult',
        requestId: 'r2',
        success: false,
        error: 'ttlHours must be at least 1',
      });

    const user = userEvent.setup();
    render(<ChatDebugSection />);

    await waitFor(() => {
      screen.getByRole('checkbox', { name: 'Enabled' });
    });

    await user.click(screen.getByRole('checkbox', { name: 'Enabled' }));

    await waitFor(() => {
      expect(screen.getByText('ttlHours must be at least 1')).toBeDefined();
    });
  });

  it('renders tree view hint text when enabled', async () => {
    vi.mocked(sendRequest).mockResolvedValue({
      type: 'getChatDebugSettingsResult',
      requestId: 'r1',
      settings: { enabled: true, ttlHours: 24 },
    });

    render(<ChatDebugSection />);
    await waitFor(() => {
      expect(screen.getByText(/Explorer sidebar/, { exact: false })).toBeDefined();
    });
  });

  it('hides tree view hint text when disabled', async () => {
    vi.mocked(sendRequest).mockResolvedValue({
      type: 'getChatDebugSettingsResult',
      requestId: 'r1',
      settings: { enabled: false, ttlHours: 24 },
    });

    render(<ChatDebugSection />);
    await waitFor(() => {
      expect(screen.getByText('Chat Debug')).toBeDefined();
    });
    expect(screen.queryByText(/Explorer sidebar/, { exact: false })).toBeNull();
  });
});
