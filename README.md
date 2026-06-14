# DepGuard MCP Server

DepGuard is an MCP server for **real-time dependency safety checks while coding**.

It helps AI agents (in IDEs or CLI tools) verify package changes against:

- **OSV vulnerability database** (CVE/GHSA findings)
- **npm deprecation metadata**
- **local SQLite cache** (fast repeated checks)

DepGuard runs on MCP stdio, so it is easy to plug into modern AI coding tools.

---

## What you get

- `check_package` → check one package/version
- `check_packages_bulk` → check many dependencies efficiently (OSV batch)
- `scan_package_json` → scan all deps in a manifest
- `get_cached_result` → quick cache retrieval
- structured response envelope: `status`, `data`, `errors`, `meta`
- severity and risk scoring (`CRITICAL | HIGH | MEDIUM | LOW | SAFE`)
- timeout + retry networking
- partial-failure behavior (best-effort results)

---

## Quick start (local)

```bash
npm install
npm run test
npm run build
npm start
```

For development:

```bash
npm run dev
```

---

## MCP client setup (copy/paste)

Use the compiled server (`dist/index.js`) for reliability.

```json
{
  "mcpServers": {
    "depguard": {
      "command": "node",
      "args": ["/absolute/path/to/depguard/dist/index.js"],
      "env": {
        "CACHE_TTL_SECONDS": "86400",
        "DEPGUARD_CACHE_PATH": "/absolute/path/to/depguard/.depguard-cache.sqlite",
        "DEPGUARD_HTTP_TIMEOUT_MS": "7000",
        "DEPGUARD_HTTP_RETRIES": "2",
        "DEPGUARD_HTTP_RETRY_DELAY_MS": "250"
      }
    }
  }
}
```

> Put this JSON in your MCP-enabled tool’s config file (location differs by client).

---

## Use from Docker (no local Node required)

Build image:

```bash
docker build -t depguard:local .
```

Run as stdio MCP server:

```bash
docker run --rm -i \
  -e CACHE_TTL_SECONDS=86400 \
  -e DEPGUARD_CACHE_PATH=/data/cache.sqlite \
  -v depguard-cache:/data \
  depguard:local
```

MCP config using Docker:

```json
{
  "mcpServers": {
    "depguard": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "CACHE_TTL_SECONDS=86400",
        "-e",
        "DEPGUARD_CACHE_PATH=/data/cache.sqlite",
        "-v",
        "depguard-cache:/data",
        "ghcr.io/<your-org>/depguard:latest"
      ]
    }
  }
}
```

---

## Tool contracts

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

---

## Response format

All tools return:

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

---

## “Vibe coding” workflow (real-time dependency safety)

Add this to your AI tool instructions/system prompt:

> Before suggesting or applying dependency changes, call `check_package` (or `check_packages_bulk`).
> If editing `package.json`, run `scan_package_json` after the change.
> If risk is HIGH/CRITICAL or package is deprecated, propose safer alternatives or fixed versions.

Suggested quick prompts:

- "Before you update dependencies, run DepGuard checks and summarize risks."
- "Scan this package.json and only keep changes that are SAFE/LOW risk."
- "I’m vibe coding fast: auto-check every new npm dependency with DepGuard first."

---

## Production configuration

Environment variables:

- `CACHE_TTL_SECONDS` (default: `86400`)
- `DEPGUARD_CACHE_PATH` (default: `.depguard-cache.sqlite`)
- `DEPGUARD_HTTP_TIMEOUT_MS` (default: `7000`)
- `DEPGUARD_HTTP_RETRIES` (default: `2`)
- `DEPGUARD_HTTP_RETRY_DELAY_MS` (default: `250`)

Notes:

- Ranged versions (e.g. `^1.2.3`) are marked as `versionResolution: "range_unresolved"`.
- For strict CI/policy usage, prefer exact lockfile versions.

---

## CI / release automation (included)

This repo includes GitHub Actions workflows:

- `.github/workflows/ci.yml`
  - Runs test + build on pushes/PRs to `main`.
- `.github/workflows/publish-npm.yml`
  - Publishes to npm on release publish (or manual dispatch).
- `.github/workflows/publish-docker.yml`
  - Publishes Docker image to GHCR on release publish (or manual dispatch).

Required secrets:

- `NPM_TOKEN` (for npm publish workflow)

---

## Publish to npm

```bash
npm login
npm run test
npm run build
npm publish --access public
```

---

## Push to GitHub

```bash
git add .
git commit -m "chore: add Docker + GitHub Actions release pipeline"
git push
```
