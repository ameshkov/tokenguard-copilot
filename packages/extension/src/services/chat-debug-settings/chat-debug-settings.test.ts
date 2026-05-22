import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { SettingsRepository } from '../../repositories/settings-repository.js';
import { ChatDebugSettingsService } from './chat-debug-settings.js';
import type { Database } from '../../db/connection.js';
import type { DatabaseSync } from 'node:sqlite';

describe('ChatDebugSettingsService', () => {
  let db: Database;
  let raw: DatabaseSync;
  let service: ChatDebugSettingsService;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    const repo = new SettingsRepository(db);
    service = new ChatDebugSettingsService(repo);
  });

  afterEach(() => {
    clearTestDb(raw);
    raw.close();
  });

  describe('getSettings', () => {
    it('returns defaults on fresh database', () => {
      const result = service.getSettings();
      expect(result).toEqual({
        enabled: false,
        ttlHours: 24,
      });
    });

    it('returns saved values after update', () => {
      service.updateSettings({ enabled: true });
      const result = service.getSettings();
      expect(result.enabled).toBe(true);
      expect(result.ttlHours).toBe(24);
    });
  });

  describe('updateSettings', () => {
    it('updates enabled only', () => {
      const result = service.updateSettings({
        enabled: true,
      });
      expect(result.enabled).toBe(true);
      expect(result.ttlHours).toBe(24);
    });

    it('updates ttlHours only', () => {
      const result = service.updateSettings({
        ttlHours: 12,
      });
      expect(result.enabled).toBe(false);
      expect(result.ttlHours).toBe(12);
    });

    it('updates both fields', () => {
      const result = service.updateSettings({
        enabled: true,
        ttlHours: 48,
      });
      expect(result.enabled).toBe(true);
      expect(result.ttlHours).toBe(48);
    });

    it('throws for ttlHours less than 1', () => {
      expect(() => service.updateSettings({ ttlHours: 0 })).toThrow('ttlHours must be at least 1');
    });

    it('throws for negative ttlHours', () => {
      expect(() => service.updateSettings({ ttlHours: -5 })).toThrow('ttlHours must be at least 1');
    });

    it('throws for non-integer ttlHours', () => {
      expect(() => service.updateSettings({ ttlHours: 2.5 })).toThrow(
        'ttlHours must be a whole number',
      );
    });

    it('persists across service instances', () => {
      service.updateSettings({
        enabled: true,
        ttlHours: 8,
      });

      const repo2 = new SettingsRepository(db);
      const service2 = new ChatDebugSettingsService(repo2);
      const result = service2.getSettings();

      expect(result.enabled).toBe(true);
      expect(result.ttlHours).toBe(8);
    });
  });
});
