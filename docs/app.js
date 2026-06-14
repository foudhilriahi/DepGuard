const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const depsInput = document.getElementById("depsInput");
const scanBtn = document.getElementById("scanBtn");
const sampleBtn = document.getElementById("sampleBtn");
const statusText = document.getElementById("statusText");
const summaryGrid = document.getElementById("summaryGrid");
const resultsEl = document.getElementById("results");
const proofMeta = document.getElementById("proofMeta");

const ORDER = { UNKNOWN: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4, SAFE: 0 };

function parseInput(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.lastIndexOf("@");
      if (at > 0) {
        return { name: line.slice(0, at).trim(), version: line.slice(at + 1).trim() };
      }
      return { name: line, version: undefined };
    });
}

function normalizeVersionForLookup(input) {
  const trimmed = input?.trim();
  if (!trimmed) return { original: input, normalized: undefined, resolution: "latest" };
  const exact = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed);
  if (exact) return { original: trimmed, normalized: trimmed, resolution: "exact" };
  return { original: trimmed, normalized: undefined, resolution: "range_unresolved" };
}

function parseCvssScore(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const asNumber = Number.parseFloat(trimmed);
  if (!Number.isNaN(asNumber) && /^\d+(?:\.\d+)?$/.test(trimmed)) return asNumber;

  const matches = trimmed.match(/([0-9]+(?:\.[0-9]+)?)/g);
  if (!matches || matches.length === 0) return null;

  const parsed = matches.map((m) => Number.parseFloat(m)).filter((n) => Number.isFinite(n));
  if (parsed.length === 0) return null;
  return Math.max(...parsed);
}

function scoreToSeverity(score) {
  if (score === null) return "UNKNOWN";
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNKNOWN";
}

function extractFixedIn(vuln) {
  const affected = vuln.affected ?? [];
  for (const item of affected) {
    const ranges = item.ranges ?? [];
    for (const range of ranges) {
      const events = range.events ?? [];
      for (const event of events) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return null;
}

function normalizeVuln(vuln) {
  const fromSeverity = parseCvssScore(vuln.severity?.[0]?.score);
  let cvss = fromSeverity;
  if (cvss === null && typeof vuln.database_specific?.cvss === "string") {
    cvss = parseCvssScore(vuln.database_specific.cvss);
  }
  if (cvss === null && typeof vuln.database_specific?.cvss === "object") {
    cvss = parseCvssScore(vuln.database_specific.cvss?.score);
  }

  const dbSeverity = typeof vuln.database_specific?.severity === "string"
    ? vuln.database_specific.severity.toUpperCase()
    : null;

  const severity = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(dbSeverity)
    ? dbSeverity
    : scoreToSeverity(cvss);

  return {
    id: vuln.id,
    aliases: vuln.aliases ?? [],
    summary: vuln.summary ?? vuln.details ?? "No summary provided",
    severity,
    cvss,
    fixedIn: extractFixedIn(vuln)
  };
}

function deriveRiskLevel(alerts) {
  if (alerts.length === 0) return "SAFE";
  const highest = alerts.reduce((acc, next) => (ORDER[next.severity] > ORDER[acc] ? next.severity : acc), "UNKNOWN");
  return highest === "UNKNOWN" ? "LOW" : highest;
}

function summarize(levels) {
  const out = { SAFE: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const level of levels) out[level] += 1;
  return out;
}

function cacheKey(name, version) {
  return `depguard-proof:${name}@${version ?? "latest"}`;
}

function getCached(name, version) {
  const key = cacheKey(name, version);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function setCached(name, version, value) {
  const key = cacheKey(name, version);
  localStorage.setItem(key, JSON.stringify({ value, expiresAt: Date.now() + CACHE_TTL_MS }));
}

async function fetchBatchOsv(packages) {
  if (packages.length === 0) return [];
  const res = await fetch("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      queries: packages.map((pkg) => ({
        package: { name: pkg.name, ecosystem: "npm" },
        ...(pkg.lookupVersion ? { version: pkg.lookupVersion } : {})
      }))
    })
  });
  if (!res.ok) throw new Error(`OSV error ${res.status}`);
  const json = await res.json();
  return (json.results ?? []).map((r) => r.vulns ?? []);
}

async function fetchDeprecation(name, exactVersion) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`npm registry error ${res.status}`);
  const json = await res.json();
  const target = exactVersion || json["dist-tags"]?.latest;
  const msg = target ? json.versions?.[target]?.deprecated : undefined;
  return msg ? { deprecated: true, message: msg } : { deprecated: false };
}

function renderSummary(summary, total, withIssues) {
  summaryGrid.innerHTML = [
    ["Total", String(total)],
    ["With issues", String(withIssues)],
    ["Critical", String(summary.CRITICAL)],
    ["High", String(summary.HIGH)],
    ["Medium", String(summary.MEDIUM)],
    ["Low", String(summary.LOW)],
    ["Safe", String(summary.SAFE)]
  ]
    .map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join("");
}

function renderResults(rows) {
  resultsEl.innerHTML = rows
    .map((row) => {
      const issues = row.vulnerabilities.map((v) =>
        `<li><span class="badge ${v.severity}">${v.severity}</span><strong>${v.id}</strong>${v.aliases.length ? ` (${v.aliases.join(", ")})` : ""}<br/>${v.summary}${v.fixedIn ? `<br/><small>Fixed in: ${v.fixedIn}</small>` : ""}</li>`
      ).join("");

      return `
        <article class="pkg">
          <div>
            <strong>${row.name}@${row.version ?? "latest"}</strong>
            <span class="badge ${row.riskLevel}">${row.riskLevel}</span>
            <span class="badge ${row.cached ? "LOW" : "UNKNOWN"}">${row.cached ? "cached" : "live"}</span>
          </div>
          <small>versionResolution: ${row.versionResolution} • deprecated: ${row.deprecated ? "yes" : "no"}</small>
          ${row.deprecated && row.deprecationMessage ? `<p><strong>Deprecation:</strong> ${row.deprecationMessage}</p>` : ""}
          ${row.vulnerabilities.length ? `<ul>${issues}</ul>` : `<p>No known vulnerabilities returned.</p>`}
        </article>
      `;
    })
    .join("");
}

async function runScan() {
  const started = Date.now();
  statusText.textContent = "Running live scan...";

  const deps = parseInput(depsInput.value);
  if (deps.length === 0) {
    statusText.textContent = "Please add at least one package.";
    return;
  }

  const prepared = deps.map((d) => {
    const versionInfo = normalizeVersionForLookup(d.version);
    return { name: d.name, ...versionInfo, lookupVersion: versionInfo.normalized };
  });

  const rows = new Array(prepared.length);
  const misses = [];

  prepared.forEach((pkg, idx) => {
    const cached = getCached(pkg.name, pkg.original);
    if (cached) rows[idx] = { ...cached, cached: true };
    else misses.push({ ...pkg, idx });
  });

  let osvResults = [];
  if (misses.length) {
    osvResults = await fetchBatchOsv(misses);
  }

  const depChecks = await Promise.allSettled(
    misses.map((m) => fetchDeprecation(m.name, m.lookupVersion))
  );

  misses.forEach((m, i) => {
    const vulnerabilities = (osvResults[i] ?? []).map(normalizeVuln);
    const dep = depChecks[i].status === "fulfilled" ? depChecks[i].value : { deprecated: false };

    const row = {
      name: m.name,
      version: m.original,
      versionResolution: m.resolution,
      vulnerabilities,
      vulnerabilityCount: vulnerabilities.length,
      deprecated: dep.deprecated,
      deprecationMessage: dep.message,
      hasIssues: vulnerabilities.length > 0 || dep.deprecated,
      riskLevel: deriveRiskLevel(vulnerabilities),
      cached: false
    };

    rows[m.idx] = row;
    setCached(m.name, m.original, row);
  });

  const stable = rows.filter(Boolean);
  const withIssues = stable.filter((r) => r.hasIssues).length;
  const summary = summarize(stable.map((r) => r.riskLevel));

  renderSummary(summary, stable.length, withIssues);
  renderResults(stable);
  statusText.textContent = `Done in ${Date.now() - started}ms (${stable.length} packages).`;
}

async function loadProofMeta() {
  try {
    const res = await fetch("./proof/latest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load proof artifact (${res.status})`);
    const json = await res.json();
    proofMeta.textContent = JSON.stringify({
      generatedAt: json.generatedAt,
      toolStatus: json.result?.status,
      packageCount: json.result?.data?.total,
      withIssues: json.result?.data?.withIssues,
      riskSummary: json.result?.data?.riskSummary,
      source: "Generated by scripts/generate-proof.mjs in CI"
    }, null, 2);
  } catch (error) {
    proofMeta.textContent = `Proof artifact unavailable: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

sampleBtn.addEventListener("click", () => {
  depsInput.value = "lodash@4.17.20\nminimist@1.2.0\nreact@18.2.0";
});
scanBtn.addEventListener("click", () => {
  runScan().catch((err) => {
    statusText.textContent = `Scan failed: ${err instanceof Error ? err.message : "unknown error"}`;
  });
});

loadProofMeta();
