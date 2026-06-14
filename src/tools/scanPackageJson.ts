import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkPackagesBulk } from "./checkBulk.js";
import type { CacheStore } from "../cache.js";
import type { OsvClient } from "../osv.js";
import type { RegistryClient } from "../registry.js";
import type {
  BulkPackageInput,
  ScanPackageJsonResult,
  ToolResponse,
} from "../types.js";

interface ScanDeps {
  cache: CacheStore;
  osvClient: OsvClient;
  registryClient: RegistryClient;
  ttlMs?: number;
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export async function scanPackageJson(
  deps: ScanDeps,
  filePath = "package.json",
  includeDev = true,
  useCache = true,
): Promise<ToolResponse<ScanPackageJsonResult>> {
  const start = Date.now();
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const raw = await readFile(resolvedPath, "utf-8");
  const pkg = JSON.parse(raw) as PackageJsonShape;

  const allDeps: BulkPackageInput[] = [];

  const pushDeps = (obj?: Record<string, string>) => {
    if (!obj) return;
    for (const [name, version] of Object.entries(obj)) {
      allDeps.push({ name, version });
    }
  };

  pushDeps(pkg.dependencies);
  if (includeDev) pushDeps(pkg.devDependencies);
  pushDeps(pkg.peerDependencies);
  pushDeps(pkg.optionalDependencies);

  const bulk = await checkPackagesBulk(
    {
      cache: deps.cache,
      osvClient: deps.osvClient,
      registryClient: deps.registryClient,
      ttlMs: deps.ttlMs,
    },
    allDeps,
    useCache,
  );

  const payload: ScanPackageJsonResult = {
    filePath: resolvedPath,
    packageCount: bulk.data.total,
    withIssues: bulk.data.withIssues,
    riskSummary: bulk.data.riskSummary,
    results: bulk.data.results,
    checkedAt: new Date().toISOString(),
  };

  return {
    status: bulk.status,
    data: payload,
    errors: bulk.errors,
    meta: {
      ...bulk.meta,
      durationMs: Date.now() - start,
      generatedAt: new Date().toISOString(),
    },
  };
}
