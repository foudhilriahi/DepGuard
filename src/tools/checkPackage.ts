import type { CacheStore } from "../cache.js";
import { deriveRiskLevel, normalizeVulnerability } from "../scoring.js";
import type { OsvClient } from "../osv.js";
import type { RegistryClient } from "../registry.js";
import { normalizeVersionForLookup } from "../version.js";
import type {
  PackageCheckInput,
  PackageCheckResult,
  PackageError,
  ToolResponse,
} from "../types.js";

const DEFAULT_TTL_MS = Number(process.env.CACHE_TTL_SECONDS ?? "86400") * 1000;

interface CheckPackageDeps {
  cache: CacheStore;
  osvClient: OsvClient;
  registryClient: RegistryClient;
  ttlMs?: number;
}

function cacheKey(packageName: string, version?: string): string {
  return `check_package:${packageName}@${version ?? "latest"}`;
}

export async function checkPackage(
  deps: CheckPackageDeps,
  input: PackageCheckInput,
): Promise<ToolResponse<PackageCheckResult>> {
  const start = Date.now();

  const packageName = input.packageName.trim();
  const versionInfo = normalizeVersionForLookup(input.version);
  const useCache = input.useCache ?? true;
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const key = cacheKey(packageName, versionInfo.original);

  if (useCache) {
    const cached = deps.cache.get<PackageCheckResult>(key);
    if (cached) {
      return {
        status: "ok",
        data: { ...cached, fromCache: true },
        errors: [],
        meta: {
          cachedHits: 1,
          apiCalls: 0,
          durationMs: Date.now() - start,
          generatedAt: new Date().toISOString(),
        },
      };
    }
  }

  const errors: PackageError[] = [];
  let apiCalls = 0;

  const [osvResult, npmResult] = await Promise.allSettled([
    deps.osvClient.query({ packageName, version: versionInfo.normalized }),
    deps.registryClient.getDeprecation(packageName, versionInfo.normalized),
  ]);

  apiCalls += 2;

  const vulnerabilitiesRaw =
    osvResult.status === "fulfilled" ? osvResult.value : [];
  if (osvResult.status === "rejected") {
    errors.push({
      packageName,
      version: versionInfo.original,
      source: "osv",
      message:
        osvResult.reason instanceof Error
          ? osvResult.reason.message
          : "OSV lookup failed",
    });
  }

  const deprecation =
    npmResult.status === "fulfilled"
      ? npmResult.value
      : { deprecated: false, message: undefined };
  if (npmResult.status === "rejected") {
    errors.push({
      packageName,
      version: versionInfo.original,
      source: "npm",
      message:
        npmResult.reason instanceof Error
          ? npmResult.reason.message
          : "npm registry lookup failed",
    });
  }

  const vulnerabilities = vulnerabilitiesRaw.map(normalizeVulnerability);
  const riskLevel = deriveRiskLevel(vulnerabilities);

  const result: PackageCheckResult = {
    packageName,
    version: versionInfo.original,
    versionResolution: versionInfo.resolution,
    vulnerabilities,
    vulnerabilityCount: vulnerabilities.length,
    deprecated: deprecation.deprecated,
    deprecationMessage: deprecation.message,
    hasIssues: vulnerabilities.length > 0 || deprecation.deprecated,
    riskLevel,
    checkedAt: new Date().toISOString(),
    fromCache: false,
  };

  deps.cache.set(key, result, ttlMs);

  return {
    status:
      errors.length === 0
        ? "ok"
        : vulnerabilities.length > 0 || deprecation.deprecated
          ? "partial"
          : "error",
    data: result,
    errors,
    meta: {
      cachedHits: 0,
      apiCalls,
      durationMs: Date.now() - start,
      generatedAt: new Date().toISOString(),
    },
  };
}
