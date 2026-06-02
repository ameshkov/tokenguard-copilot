import { describe, it, expect } from 'vitest';
import { summarizeError } from './error.js';

describe('summarizeError', () => {
  it('returns message and name for a plain Error', () => {
    const e = new Error('boom');
    expect(summarizeError(e)).toBe('message=boom');
  });

  it('includes the error name when it is not the default "Error"', () => {
    const e = new TypeError('fetch failed');
    expect(summarizeError(e)).toBe('name=TypeError message=fetch failed');
  });

  it('walks the cause chain and includes cause message and system fields', () => {
    const dnsCause = Object.assign(new Error('getaddrinfo ENOTFOUND api.example.invalid'), {
      code: 'ENOTFOUND',
      errno: -3008,
      syscall: 'getaddrinfo',
      hostname: 'api.example.invalid',
    });
    const wrapped = new TypeError('fetch failed', { cause: dnsCause });

    const summary = summarizeError(wrapped);

    expect(summary).toContain('name=TypeError');
    expect(summary).toContain('message=fetch failed');
    expect(summary).toContain('code=ENOTFOUND');
    expect(summary).toContain('syscall=getaddrinfo');
    expect(summary).toContain('hostname=api.example.invalid');
  });

  it('includes address and port when present on the cause', () => {
    const connectCause = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:443'), {
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '10.0.0.1',
      port: 443,
    });

    const summary = summarizeError(connectCause);

    expect(summary).toContain('code=ECONNREFUSED');
    expect(summary).toContain('syscall=connect');
    expect(summary).toContain('address=10.0.0.1');
    expect(summary).toContain('port=443');
  });

  it('walks multiple levels of cause', () => {
    const root = new Error('root cause');
    const middle = new Error('middle', { cause: root });
    const top = new Error('top', { cause: middle });

    const summary = summarizeError(top);

    expect(summary).toContain('message=top');
    expect(summary).toContain('message=middle');
    expect(summary).toContain('message=root cause');
  });

  it('falls back to value= for non-Error throwables', () => {
    expect(summarizeError('plain string')).toBe('value=plain string');
    expect(summarizeError(42)).toBe('value=42');
    expect(summarizeError({ code: 'X' })).toContain('value=');
  });

  it('handles null and undefined without throwing', () => {
    expect(summarizeError(null)).toBe('value=null');
    expect(summarizeError(undefined)).toBe('value=undefined');
  });

  it('caps the cause-chain walk to avoid loops', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    // Intentionally create a cycle (a.cause = b) to verify the
    // walk terminates.
    (a as Error & { cause?: unknown }).cause = b;

    expect(() => summarizeError(b)).not.toThrow();
  });
});
