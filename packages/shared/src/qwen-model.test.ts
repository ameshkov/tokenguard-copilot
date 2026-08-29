import { describe, it, expect } from 'vitest';
import { isQwen37OrOlder } from './qwen-model.js';

describe('isQwen37OrOlder', () => {
  it('enables Qwen 3.7 models', () => {
    expect(isQwen37OrOlder('qwen/qwen3.7-max')).toBe(true);
    expect(isQwen37OrOlder('qwen3.7-plus')).toBe(true);
    expect(isQwen37OrOlder('alibaba/qwen3.7-max')).toBe(true);
    expect(isQwen37OrOlder('qwen3.7-max:thinking')).toBe(true);
  });

  it('enables older Qwen versions', () => {
    expect(isQwen37OrOlder('qwen3.6-plus')).toBe(true);
    expect(isQwen37OrOlder('qwen3.6-27b:thinking')).toBe(true);
    expect(isQwen37OrOlder('qwen3.5-flash')).toBe(true);
    expect(isQwen37OrOlder('qwen3-max')).toBe(true);
    expect(isQwen37OrOlder('qwen3-30b-a3b-fp8')).toBe(true);
    expect(isQwen37OrOlder('qwen-3-14b')).toBe(true);
    expect(isQwen37OrOlder('qwen-3.6-max-preview')).toBe(true);
    expect(isQwen37OrOlder('qwen2.5-coder-32b-instruct')).toBe(true);
  });

  it('enables dropped-dot Qwen version IDs', () => {
    // models.dev uses "qwen35" for Qwen 3.5 and "qwen25" for 2.5.
    expect(isQwen37OrOlder('qwen35-397b-a17b')).toBe(true);
    expect(isQwen37OrOlder('alibaba/qwen35-397b-a17b')).toBe(true);
    expect(isQwen37OrOlder('qwen25-vl-72b-instruct')).toBe(true);
  });

  it('enables legacy unversioned Qwen and QwQ models', () => {
    expect(isQwen37OrOlder('qwen-plus')).toBe(true);
    expect(isQwen37OrOlder('qwen-max')).toBe(true);
    expect(isQwen37OrOlder('alibaba/qwen-flash')).toBe(true);
    expect(isQwen37OrOlder('qwen-omni-turbo')).toBe(true);
    expect(isQwen37OrOlder('Qwen/QwQ-32B')).toBe(true);
    expect(isQwen37OrOlder('@cf/qwen/qwq-32b')).toBe(true);
  });

  it('excludes Qwen 3.8 and newer', () => {
    expect(isQwen37OrOlder('qwen3.8-max')).toBe(false);
    expect(isQwen37OrOlder('qwen3.8-27b')).toBe(false);
    expect(isQwen37OrOlder('alibaba/qwen3.8-flash')).toBe(false);
    expect(isQwen37OrOlder('qwen3.8-2.4t-a95b')).toBe(false);
  });

  it('excludes provider prefixes that only mention qwen', () => {
    // "qwen" in a provider path alone is not a Qwen model ID.
    expect(isQwen37OrOlder('qwen/other-model')).toBe(false);
  });

  it('excludes non-Qwen models', () => {
    expect(isQwen37OrOlder('gpt-5.4')).toBe(false);
    expect(isQwen37OrOlder('kimi-k2-7')).toBe(false);
    expect(isQwen37OrOlder('deepseek-v4-pro')).toBe(false);
    expect(isQwen37OrOlder('')).toBe(false);
  });
});
