import type { CacheStore } from "../cache.js";
import {
  deriveRiskLevel,
  normalizeVulnerability,
  summarizeRisks,
} from "../scoring.js";
import type { OsvClient } from "../osv.js";
import type { RegistryClient } from "../registry.js";
import { normalizeVersionForLookup } from "../version.js";
import type {
  BulkCheckResult,
  BulkPackageInput,
  PackageCheckResult,
  PackageError,
  ToolResponse,
  OsvVulnerability,
  RegistryDeprecation,
} from "../types.js";

const DEFAULT_TTL_MS = Number(process.env.CACHE_TTL_SECONDS ?? "86400") * 1000;

interface CheckBulkDeps {
  cache: CacheStore;
  osvClient: OsvClient;
  registryClient: RegistryClient;
  ttlMs?: number;
}

function cacheKey(packageName: string, version?: string): string {
  return `check_package:${packageName}@${version ?? "latest"}`;
}

interface PreparedPackage {
  index: number;
  name: string;
  originalVersion?: string;
  lookupVersion?: string;
  versionResolution: "exact" | "range_unresolved" | "latest";
}

export async function checkPackagesBulk(
  deps: CheckBulkDeps,
  packages: BulkPackageInput[],
  useCache = true,
): Promise<ToolResponse<BulkCheckResult>> {
  const start = Date.now();
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;

  const prepared: PreparedPackage[] = packages.map((p, index) => {
    const name = p.name.trim();
    const versionInfo = normalizeVersionForLookup(p.version);

    return {
      index,
      name,
      originalVersion: versionInfo.original,
      lookupVersion: versionInfo.normalized,
      versionResolution: versionInfo.resolution,
    };
  });

  const results: PackageCheckResult[] = new Array(prepared.length);
  const misses: PreparedPackage[] = [];
  const errors: PackageError[] = [];

  let cachedHits = 0;
  let apiCalls = 0;

  for (const pkg of prepared) {
    if (!useCache) {
      misses.push(pkg);
      continue;
    }

    const cached = deps.cache.get<PackageCheckResult>(
      cacheKey(pkg.name, pkg.originalVersion),
    );
    if (cached) {
      cachedHits += 1;
      results[pkg.index] = {
        ...cached,
        fromCache: true,
        versionResolution: pkg.versionResolution,
      };
    } else {
      misses.push(pkg);
    }
  }

  if (misses.length > 0) {
    let osvMatrix: OsvVulnerability[][] = new Array(misses.length)
      .fill(null)
      .map(() => []);

    try {
      osvMatrix = await deps.osvClient.queryBatch(
        misses.map((m) => ({ packageName: m.name, version: m.lookupVersion })),
      );
      apiCalls += 1;
    } catch (error) {
      errors.push({
        packageName: "*",
        source: "osv",
        message:
          error instanceof Error
            ? `OSV batch failed, falling back to per-package lookups: ${error.message}`
            : "OSV batch failed, falling back to per-package lookups",
      });

      const settled = await Promise.allSettled(
        misses.map((m) =>
          deps.osvClient.query({
            packageName: m.name,
            version: m.lookupVersion,
          }),
        ),
      );
      apiCalls += misses.length;

      settled.forEach((entry, i) => {
        if (entry.status === "fulfilled") {
          osvMatrix[i] = entry.value;
          return;
        }

        errors.push({
          packageName: misses[i].name,
          version: misses[i].originalVersion,
          source: "osv",
          message:
            entry.reason instanceof Error
              ? entry.reason.message
              : "OSV lookup failed",
        });
      });
    }

    const depSettled = await Promise.allSettled(
      misses.map((m) =>
        deps.registryClient.getDeprecation(m.name, m.lookupVersion),
      ),
    );
    apiCalls += misses.length;

    const deprecations: RegistryDeprecation[] = depSettled.map((entry, i) => {
      if (entry.status === "fulfilled") return entry.value;
      errors.push({
        packageName: misses[i].name,
        version: misses[i].originalVersion,
        source: "npm",
        message:
          entry.reason instanceof Error
            ? entry.reason.message
            : "npm registry lookup failed",
      });
      return { deprecated: false };
    });

    misses.forEach((pkg, i) => {
      const vulnerabilities = (osvMatrix[i] ?? []).map(normalizeVulnerability);
      const deprecation = deprecations[i] ?? { deprecated: false };

      const row: PackageCheckResult = {
        packageName: pkg.name,
        version: pkg.originalVersion,
        versionResolution: pkg.versionResolution,
        vulnerabilities,
        vulnerabilityCount: vulnerabilities.length,
        deprecated: deprecation.deprecated,
        deprecationMessage: deprecation.message,
        hasIssues: vulnerabilities.length > 0 || deprecation.deprecated,
        riskLevel: deriveRiskLevel(vulnerabilities),
        checkedAt: new Date().toISOString(),
        fromCache: false,
      };

      results[pkg.index] = row;
      deps.cache.set(cacheKey(pkg.name, pkg.originalVersion), row, ttlMs);
    });
  }

  const stableResults = results.filter((r): r is PackageCheckResult =>
    Boolean(r),
  );
  const withIssues = stableResults.filter((r) => r.hasIssues).length;

  const payload: BulkCheckResult = {
    results: stableResults,
    total: stableResults.length,
    withIssues,
    riskSummary: summarizeRisks(stableResults.map((r) => r.riskLevel)),
    checkedAt: new Date().toISOString(),
  };

  const status =
    errors.length === 0 ? "ok" : stableResults.length > 0 ? "partial" : "error";

  return {
    status,
    data: payload,
    errors,
    meta: {
      cachedHits,
      apiCalls,
      durationMs: Date.now() - start,
      generatedAt: new Date().toISOString(),
    },
  };
}
