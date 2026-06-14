import Database from "better-sqlite3";

interface CacheRow {
  value: string;
  expires_at: number;
}

export class CacheStore {
  private readonly db: Database.Database;

  constructor(dbPath: string = ".depguard-cache.sqlite") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);
    `);
  }

  get<T>(key: string): T | null {
    const row = this.db
      .prepare("SELECT value, expires_at FROM cache WHERE key = ?")
      .get(key) as CacheRow | undefined;

    if (!row) return null;

    if (row.expires_at <= Date.now()) {
      this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      return null;
    }

    return JSON.parse(row.value) as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    const expiresAt = Date.now() + ttlMs;
    this.db
      .prepare(`
        INSERT INTO cache(key, value, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          expires_at = excluded.expires_at
      `)
      .run(key, JSON.stringify(value), expiresAt);
  }

  clearExpired(): number {
    const result = this.db.prepare("DELETE FROM cache WHERE expires_at <= ?").run(Date.now());
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
