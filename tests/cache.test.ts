import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { CacheStore } from "../src/cache.js";

const dbPath = path.resolve(process.cwd(), "tests", ".tmp-cache.sqlite");

afterEach(() => {
  if (existsSync(dbPath)) {
    rmSync(dbPath);
  }
});

describe("CacheStore", () => {
  it("stores and retrieves non-expired values", () => {
    const cache = new CacheStore(dbPath);
    cache.set("k1", { ok: true }, 5000);

    const value = cache.get<{ ok: boolean }>("k1");
    expect(value).toEqual({ ok: true });

    cache.close();
  });

  it("evicts expired values on read", async () => {
    const cache = new CacheStore(dbPath);
    cache.set("k2", { ok: true }, 5);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const value = cache.get<{ ok: boolean }>("k2");
    expect(value).toBeNull();

    cache.close();
  });
});
