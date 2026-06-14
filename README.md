# DepGuard MCP Server

DepGuard is a production-focused MCP server that checks npm dependency risk using:

- **OSV** vulnerability data (`/query`, `/querybatch`)
- **npm registry** deprecation metadata
- **SQLite cache** with TTL to reduce repeated API calls

It runs over **stdio JSON-RPC**, so it works with MCP-enabled IDEs and CLI agents.

## Features

- `check_package` for single package checks
- `check_packages_bulk` for batch checks (OSV batch endpoint)
- `scan_package_json` to scan dependency blocks from `package.json`
- `get_cached_result` for cache retrieval
- Structured responses with `status`, `data`, `errors`, `meta`
- Timeout + retry HTTP behavior
- Risk scoring (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `SAFE`)
- Partial-failure behavior (one bad package/API won’t kill whole bulk run)

## Install

```bash
npm install
npm run build
```

Run locally:

```bash
npm start
```

Dev mode:

```bash
npm run dev
```

## MCP Tool Contracts

### `check_package`
Input:

```json
{
  "packageName": "lodash",
  "version": "4.17.20",
  "useCache": true
}
```

### `check_packages_bulk`
Input:

```json
{
  "packages": [
    { "name": "lodash", "version": "4.17.20" },
    { "name": "minimist", "version": "1.2.0" }
  ],
  "useCache": true
}
```

### `scan_package_json`
Input:

```json
{
  "path": "package.json",
  "includeDev": true,
  "useCache": true
}
```

### `get_cached_result`
Input:

```json
{
  "packageName": "lodash",
  "version": "4.17.20"
}
```

## Response Shape

Every tool returns:

```json
{
  "status": "ok | partial | error",
  "data": {},
  "errors": [],
  "meta": {
    "cachedHits": 0,
    "apiCalls": 0,
    "durationMs": 0,
    "generatedAt": "2026-06-14T00:00:00.000Z"
  }
}
```

## Configuration

Environment variables:

- `CACHE_TTL_SECONDS` (default: `86400`)
- `DEPGUARD_CACHE_PATH` (default: `.depguard-cache.sqlite`)
- `DEPGUARD_HTTP_TIMEOUT_MS` (default: `7000`)
- `DEPGUARD_HTTP_RETRIES` (default: `2`)
- `DEPGUARD_HTTP_RETRY_DELAY_MS` (default: `250`)

## Use with MCP Clients

Use compiled output for reliability.

```json
{
  "mcpServers": {
    "depguard": {
      "command": "node",
      "args": ["/absolute/path/to/depguard/dist/index.js"],
      "env": {
        "CACHE_TTL_SECONDS": "86400",
        "DEPGUARD_CACHE_PATH": "/absolute/path/to/depguard/.depguard-cache.sqlite"
      }
    }
  }
}
```

Restart your IDE/CLI client after updating config.

## Validation

```bash
npm run test
npm run build
```

## Publish to npm (optional)

```bash
npm login
npm run build
npm run test
npm publish --access public
```

Then users can configure MCP using:

- `command`: `npx`
- `args`: `["-y", "depguard", "depguard-mcp"]` (if you publish with this package name)

## GitHub Upload

```bash
git init
git add .
git commit -m "feat: production-ready depguard mcp server"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

## Notes

- If a dependency version is a range (like `^1.2.3`), DepGuard marks it as `versionResolution: "range_unresolved"` unless exact version is provided.
- For best accuracy in CI/policy checks, use exact versions from lockfiles.
