import { fetchJsonWithRetry } from "./http.js";
import type { RegistryDeprecation } from "./types.js";

interface NpmPackageVersion {
  deprecated?: string;
}

interface NpmPackageMetadata {
  "dist-tags"?: {
    latest?: string;
  };
  versions?: Record<string, NpmPackageVersion>;
}

export interface RegistryClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export class RegistryClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(options: RegistryClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://registry.npmjs.org";
    this.timeoutMs = options.timeoutMs ?? 7000;
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
  }

  async getDeprecation(
    packageName: string,
    version?: string,
  ): Promise<RegistryDeprecation> {
    const encoded = encodeURIComponent(packageName);

    const metadata = await fetchJsonWithRetry<NpmPackageMetadata>(
      `${this.baseUrl}/${encoded}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
      },
      {
        timeoutMs: this.timeoutMs,
        retries: this.retries,
        retryDelayMs: this.retryDelayMs,
      },
    );

    const versions = metadata.versions ?? {};
    const targetVersion = version || metadata["dist-tags"]?.latest;

    if (!targetVersion) {
      return { deprecated: false };
    }

    const deprecatedMessage = versions[targetVersion]?.deprecated;
    if (deprecatedMessage) {
      return { deprecated: true, message: deprecatedMessage };
    }

    return { deprecated: false };
  }
}
