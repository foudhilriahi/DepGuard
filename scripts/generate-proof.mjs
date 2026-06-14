import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { CacheStore } from "../dist/cache.js";
import { OsvClient } from "../dist/osv.js";
import { RegistryClient } from "../dist/registry.js";
import { checkPackagesBulk } from "../dist/tools/checkBulk.js";

const cwd = process.cwd();
const outDir = path.join(cwd, "docs", "proof");
const outFile = path.join(outDir, "latest.json");
const cachePath = path.join(cwd, ".proof-cache.sqlite");

const packages = [
  { name: "lodash", version: "4.17.20" },
  { name: "minimist", version: "1.2.0" },
  { name: "react", version: "18.2.0" }
];

const cache = new CacheStore(cachePath);
const osvClient = new OsvClient({ timeoutMs: 10000, retries: 2, retryDelayMs: 300 });
const registryClient = new RegistryClient({ timeoutMs: 10000, retries: 2, retryDelayMs: 300 });

try {
  const result = await checkPackagesBulk(
    { cache, osvClient, registryClient, ttlMs: 60_000 },
    packages,
    false
  );

  const artifact = {
    generatedAt: new Date().toISOString(),
    source: "depguard/scripts/generate-proof.mjs",
    note: "Real network run using DepGuard core logic (no mocks).",
    input: { packages },
    result
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(artifact, null, 2));
  console.log(`Wrote proof artifact to ${outFile}`);
} finally {
  cache.close();
}
