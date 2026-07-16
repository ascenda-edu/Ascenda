import {
  contextCacheKey,
  getCachedContext,
  setCachedContext,
  __resetContextCache,
  DEFAULT_CONTEXT_TTL_MS,
} from '@/lib/chat/cache';
import type { ChatContext } from '@/lib/chat/context';

const ctx = (label: string): ChatContext => ({ context: label, signals: {} });

describe('chat context cache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetContextCache();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds distinct keys per mode/user/child', () => {
    expect(contextCacheKey('student', 'u1')).toBe('student:u1:');
    expect(contextCacheKey('parent', 'u1', 'child-2')).toBe('parent:u1:child-2');
    expect(contextCacheKey('student', 'u1')).not.toBe(contextCacheKey('counsellor', 'u1'));
  });

  it('returns a cached value within the TTL', () => {
    setCachedContext('k', ctx('hello'));
    jest.advanceTimersByTime(DEFAULT_CONTEXT_TTL_MS - 1_000);
    expect(getCachedContext('k')?.context).toBe('hello');
  });

  it('expires after the TTL', () => {
    setCachedContext('k', ctx('hello'));
    jest.advanceTimersByTime(DEFAULT_CONTEXT_TTL_MS + 1);
    expect(getCachedContext('k')).toBeUndefined();
  });

  it('misses for unknown keys and after reset', () => {
    expect(getCachedContext('missing')).toBeUndefined();
    setCachedContext('k', ctx('hello'));
    __resetContextCache();
    expect(getCachedContext('k')).toBeUndefined();
  });
});
