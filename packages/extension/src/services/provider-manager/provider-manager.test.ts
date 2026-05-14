import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type * as vscode from 'vscode';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { ProviderRepository } from '../../repositories/provider-repository.js';
import { ProviderManager } from './provider-manager.js';
import type { Database } from '../../db/connection.js';
import type { DatabaseSync } from 'node:sqlite';

vi.mock('vscode', () => {
  return {
    EventEmitter: class {
      private handlers: Array<() => void> = [];
      event = (handler: () => void) => {
        this.handlers.push(handler);
        return { dispose: () => {} };
      };
      fire() {
        for (const h of this.handlers) h();
      }
      dispose() {}
    },
  };
});

describe('ProviderManager', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: ProviderRepository;
  let secrets: {
    store: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let resetCallback: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let manager: ProviderManager;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    repo = new ProviderRepository(db);
    secrets = {
      store: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    resetCallback = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    manager = new ProviderManager(repo, secrets as unknown as vscode.SecretStorage, resetCallback);
  });

  afterEach(() => {
    clearTestDb(raw);
    vi.restoreAllMocks();
  });

  describe('addProvider', () => {
    it('succeeds with valid inputs', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const info = await manager.addProvider('OpenAI', 'https://api.openai.com', 'sk-key');
      expect(info.name).toBe('OpenAI');
      expect(info.baseUrl).toBe('https://api.openai.com');
      expect(info.id).toBeDefined();
      expect(secrets.store).toHaveBeenCalledWith(
        `tokenguard-copilot.provider.${info.id}`,
        'sk-key',
      );
    });

    it('throws on empty name', async () => {
      await expect(manager.addProvider('', 'https://a.com', 'key')).rejects.toThrow(
        'Provider name is required',
      );
    });

    it('throws on invalid URL', async () => {
      await expect(manager.addProvider('A', 'not-a-url', 'key')).rejects.toThrow(
        'Invalid base URL',
      );
    });

    it('throws on empty API key', async () => {
      await expect(manager.addProvider('A', 'https://a.com', '')).rejects.toThrow(
        'API key is required',
      );
    });

    it('throws on duplicate name', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      await manager.addProvider('Dup', 'https://a.com', 'key');
      await expect(manager.addProvider('Dup', 'https://b.com', 'key2')).rejects.toThrow(
        'A provider with this name already exists',
      );
    });

    it('throws on fetch network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      await expect(manager.addProvider('A', 'https://a.com', 'key')).rejects.toThrow(
        'ECONNREFUSED',
      );
      expect(repo.findAll()).toHaveLength(0);
    });

    it('throws on fetch 401', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        }),
      );
      await expect(manager.addProvider('A', 'https://a.com', 'key')).rejects.toThrow(
        /401.*Unauthorized/,
      );
      expect(repo.findAll()).toHaveLength(0);
    });
  });

  describe('getProviders', () => {
    it('returns non-removed providers', () => {
      repo.insert({
        id: 'p1',
        name: 'A',
        baseUrl: 'https://a.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      repo.insert({
        id: 'p2',
        name: 'B',
        baseUrl: 'https://b.com',
        removed: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      const list = manager.getProviders();
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        id: 'p1',
        name: 'A',
        baseUrl: 'https://a.com',
      });
    });
  });

  describe('getAllProviders', () => {
    it('includes removed providers', () => {
      repo.insert({
        id: 'p1',
        name: 'A',
        baseUrl: 'https://a.com',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      repo.insert({
        id: 'p2',
        name: 'B',
        baseUrl: 'https://b.com',
        removed: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(manager.getAllProviders()).toHaveLength(2);
    });
  });

  describe('onProvidersChanged', () => {
    it('fires after addProvider', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const listener = vi.fn();
      manager.onProvidersChanged(listener);
      await manager.addProvider('A', 'https://a.com', 'key');
      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('editProvider', () => {
    it('throws when name is empty', async () => {
      await expect(manager.editProvider('p1', '', 'https://x.com', '')).rejects.toThrow(
        'Provider name is required',
      );
    });

    it('throws when base URL is invalid', async () => {
      await expect(manager.editProvider('p1', 'Test', 'bad-url', '')).rejects.toThrow(
        'Invalid base URL',
      );
    });

    it('throws when name is duplicate', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      await manager.addProvider('Dup', 'https://a.com', 'key');
      await manager.addProvider('Other', 'https://b.com', 'key2');

      const all = repo.findAll();
      const otherId = all.find((p) => p.name === 'Other')!.id;

      await expect(manager.editProvider(otherId, 'Dup', 'https://x.com', '')).rejects.toThrow(
        'A provider with this name already exists',
      );
    });

    it('throws when provider not found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      secrets.get.mockResolvedValue('existing-key');
      await expect(manager.editProvider('nonexistent', 'New', 'https://x.com', '')).rejects.toThrow(
        'Provider not found',
      );
    });

    it('throws on fetch verification failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('P', 'https://p.com', 'key');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
        }),
      );
      secrets.get.mockResolvedValue('existing-key');

      await expect(manager.editProvider(added.id, 'P', 'https://p.com', '')).rejects.toThrow(
        /401.*Unauthorized/,
      );
    });

    it('uses existing key for verification when apiKey is empty', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('P', 'https://p.com', 'key');
      secrets.get.mockResolvedValue('existing-key');

      await manager.editProvider(added.id, 'P', 'https://new.com', '');

      expect(secrets.get).toHaveBeenCalledWith(`tokenguard-copilot.provider.${added.id}`);
      const fetchCalls = vi.mocked(fetch).mock.calls;
      const lastCall = fetchCalls[fetchCalls.length - 1];
      expect(lastCall[1]).toEqual(
        expect.objectContaining({
          headers: { Authorization: 'Bearer existing-key' },
        }),
      );
    });

    it('uses new key for verification when apiKey is provided', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('P', 'https://p.com', 'key');

      await manager.editProvider(added.id, 'P', 'https://p.com', 'new-key');

      const fetchCalls = vi.mocked(fetch).mock.calls;
      const lastCall = fetchCalls[fetchCalls.length - 1];
      expect(lastCall[1]).toEqual(
        expect.objectContaining({
          headers: { Authorization: 'Bearer new-key' },
        }),
      );
    });

    it('updates provider and returns info', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('Old', 'https://old.com', 'key');
      secrets.get.mockResolvedValue('key');

      const result = await manager.editProvider(added.id, 'New', 'https://new.com', '');
      expect(result).toEqual({
        id: added.id,
        name: 'New',
        baseUrl: 'https://new.com',
      });
    });

    it('updates secret when apiKey is provided', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('P', 'https://p.com', 'key');
      secrets.store.mockClear();

      await manager.editProvider(added.id, 'P', 'https://p.com', 'new-key');
      expect(secrets.store).toHaveBeenCalledWith(
        `tokenguard-copilot.provider.${added.id}`,
        'new-key',
      );
    });

    it('does not update secret when apiKey is empty', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('P', 'https://p.com', 'key');
      secrets.store.mockClear();
      secrets.get.mockResolvedValue('existing-key');

      await manager.editProvider(added.id, 'P', 'https://p.com', '');
      expect(secrets.store).not.toHaveBeenCalled();
    });

    it('fires onProvidersChanged', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('P', 'https://p.com', 'key');
      secrets.get.mockResolvedValue('key');

      const listener = vi.fn();
      manager.onProvidersChanged(listener);
      await manager.editProvider(added.id, 'New', 'https://new.com', '');
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('removeProvider', () => {
    it('soft-removes provider and deletes secret', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('P', 'https://p.com', 'key');

      await manager.removeProvider(added.id);

      expect(secrets.delete).toHaveBeenCalledWith(`tokenguard-copilot.provider.${added.id}`);
      expect(manager.getProviders()).toHaveLength(0);
    });

    it('throws when provider not found', async () => {
      await expect(manager.removeProvider('nonexistent')).rejects.toThrow('Provider not found');
    });

    it('fires onProvidersChanged', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const added = await manager.addProvider('P', 'https://p.com', 'key');

      const listener = vi.fn();
      manager.onProvidersChanged(listener);
      await manager.removeProvider(added.id);
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('resetAll', () => {
    it('calls the reset callback and fires event', async () => {
      const listener = vi.fn();
      manager.onProvidersChanged(listener);

      await manager.resetAll();

      expect(resetCallback).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
    });
  });
});
