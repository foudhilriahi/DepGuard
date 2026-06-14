#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { CacheStore } from "./cache.js";
import { OsvClient } from "./osv.js";
import { RegistryClient } from "./registry.js";
import { checkPackage } from "./tools/checkPackage.js";
import { checkPackagesBulk } from "./tools/checkBulk.js";
import { scanPackageJson } from "./tools/scanPackageJson.js";
import type { PackageCheckResult, ToolResponse } from "./types.js";

const server = new McpServer({
  name: "depguard",
  version: "0.2.0",
});

const cache = new CacheStore(
  process.env.DEPGUARD_CACHE_PATH ?? ".depguard-cache.sqlite",
);
const osvClient = new OsvClient({
  timeoutMs: Number(process.env.DEPGUARD_HTTP_TIMEOUT_MS ?? "7000"),
  retries: Number(process.env.DEPGUARD_HTTP_RETRIES ?? "2"),
  retryDelayMs: Number(process.env.DEPGUARD_HTTP_RETRY_DELAY_MS ?? "250"),
});
const registryClient = new RegistryClient({
  timeoutMs: Number(process.env.DEPGUARD_HTTP_TIMEOUT_MS ?? "7000"),
  retries: Number(process.env.DEPGUARD_HTTP_RETRIES ?? "2"),
  retryDelayMs: Number(process.env.DEPGUARD_HTTP_RETRY_DELAY_MS ?? "250"),
});

function textResponse(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function toolFailure<T>(message: string): ToolResponse<T> {
  return {
    status: "error",
    data: {} as T,
    errors: [{ packageName: "*", source: "system", message }],
    meta: {
      cachedHits: 0,
      apiCalls: 0,
      durationMs: 0,
      generatedAt: new Date().toISOString(),
    },
  };
}

server.tool(
  "check_package",
  {
    packageName: z.string().min(1),
    version: z.string().optional(),
    useCache: z.boolean().optional(),
  },
  async ({ packageName, version, useCache }) => {
    try {
      const result = await checkPackage(
        { cache, osvClient, registryClient },
        { packageName, version, useCache },
      );
      return textResponse(result);
    } catch (error) {
      return textResponse(
        toolFailure(
          error instanceof Error ? error.message : "Unexpected server error",
        ),
      );
    }
  },
);

server.tool(
  "check_packages_bulk",
  {
    packages: z
      .array(
        z.object({
          name: z.string().min(1),
          version: z.string().optional(),
        }),
      )
      .min(1)
      .max(500),
    useCache: z.boolean().optional(),
  },
  async ({ packages, useCache }) => {
    try {
      const result = await checkPackagesBulk(
        { cache, osvClient, registryClient },
        packages,
        useCache ?? true,
      );
      return textResponse(result);
    } catch (error) {
      return textResponse(
        toolFailure(
          error instanceof Error ? error.message : "Unexpected server error",
        ),
      );
    }
  },
);

server.tool(
  "scan_package_json",
  {
    path: z.string().optional(),
    includeDev: z.boolean().optional(),
    useCache: z.boolean().optional(),
  },
  async ({ path, includeDev, useCache }) => {
    try {
      const result = await scanPackageJson(
        { cache, osvClient, registryClient },
        path ?? "package.json",
        includeDev ?? true,
        useCache ?? true,
      );
      return textResponse(result);
    } catch (error) {
      return textResponse(
        toolFailure(
          error instanceof Error ? error.message : "Unexpected server error",
        ),
      );
    }
  },
);

server.tool(
  "get_cached_result",
  {
    packageName: z.string().min(1),
    version: z.string().optional(),
  },
  async ({ packageName, version }) => {
    const cacheKey = `check_package:${packageName.trim()}@${version?.trim() ?? "latest"}`;
    const cached = cache.get<PackageCheckResult>(cacheKey);

    return textResponse({
      status: "ok",
      data: cached,
      errors: [],
      meta: {
        cachedHits: cached ? 1 : 0,
        apiCalls: 0,
        durationMs: 0,
        generatedAt: new Date().toISOString(),
      },
    });
  },
);

const transport = new StdioServerTransport();

process.on("SIGINT", () => {
  cache.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cache.close();
  process.exit(0);
});

await server.connect(transport);
