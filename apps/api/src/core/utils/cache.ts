export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  storedAt: number;
}

/**
 * Small in-process TTL cache used to avoid hammering NSE. It is intentionally
 * not a distributed cache: one API process, one cache. Persistence
 * (deduplication of stored observations) is handled by PostgreSQL.
 */
export class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  get<T>(key: string, now = Date.now()): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number, now = Date.now()): void {
    if (ttlMs <= 0) return;
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: now + ttlMs, storedAt: now });
  }

  ageSeconds(key: string, now = Date.now()): number | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    return Math.round((now - entry.storedAt) / 1000);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export const marketCache = new TtlCache(1000);
