import { fetchJsonWithRetry } from "./http.js";
import type { OsvPackageQuery, OsvVulnerability } from "./types.js";

const OSV_BASE_URL = "https://api.osv.dev/v1";

interface OsvQueryResponse {
  vulns?: OsvVulnerability[];
}

interface OsvBatchResponse {
  results?: Array<{ vulns?: OsvVulnerability[] }>;
}

export interface OsvClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export class OsvClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(options: OsvClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? OSV_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? 7000;
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
  }

  async query(pkg: OsvPackageQuery): Promise<OsvVulnerability[]> {
    const body = {
      package: {
        name: pkg.packageName,
        ecosystem: "npm",
      },
      ...(pkg.version ? { version: pkg.version } : {}),
    };

    const data = await fetchJsonWithRetry<OsvQueryResponse>(
      `${this.baseUrl}/query`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: this.timeoutMs,
        retries: this.retries,
        retryDelayMs: this.retryDelayMs,
      },
    );

    return data.vulns ?? [];
  }

  async queryBatch(packages: OsvPackageQuery[]): Promise<OsvVulnerability[][]> {
    if (packages.length === 0) return [];

    const body = {
      queries: packages.map((pkg) => ({
        package: {
          name: pkg.packageName,
          ecosystem: "npm",
        },
        ...(pkg.version ? { version: pkg.version } : {}),
      })),
    };

    const data = await fetchJsonWithRetry<OsvBatchResponse>(
      `${this.baseUrl}/querybatch`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: this.timeoutMs,
        retries: this.retries,
        retryDelayMs: this.retryDelayMs,
      },
    );

    return (data.results ?? []).map((r) => r.vulns ?? []);
  }
}
