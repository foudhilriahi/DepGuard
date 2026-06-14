import type {
  OsvVulnerability,
  RiskLevel,
  SeverityLevel,
  VulnAlert,
} from "./types.js";

const ORDER: Record<SeverityLevel | RiskLevel, number> = {
  UNKNOWN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
  SAFE: 0,
};

export function parseCvssScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const asNumber = Number.parseFloat(trimmed);
  if (!Number.isNaN(asNumber) && /^\d+(?:\.\d+)?$/.test(trimmed))
    return asNumber;

  const matches = trimmed.match(/([0-9]+(?:\.[0-9]+)?)/g);
  if (!matches || matches.length === 0) return null;

  const parsed = matches
    .map((m) => Number.parseFloat(m))
    .filter((n) => Number.isFinite(n));

  if (parsed.length === 0) return null;
  return Math.max(...parsed);
}

export function scoreToSeverity(score: number | null): SeverityLevel {
  if (score === null) return "UNKNOWN";
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNKNOWN";
}

function extractFixedIn(vuln: OsvVulnerability): string | null {
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

function extractScore(vuln: OsvVulnerability): number | null {
  const severityScore = vuln.severity?.[0]?.score;
  const fromSeverity = parseCvssScore(severityScore);
  if (fromSeverity !== null) return fromSeverity;

  const dbCvss = vuln.database_specific?.cvss;
  if (typeof dbCvss === "string") {
    const parsed = parseCvssScore(dbCvss);
    if (parsed !== null) return parsed;
  } else if (dbCvss && typeof dbCvss === "object") {
    const parsed = parseCvssScore((dbCvss as { score?: unknown }).score);
    if (parsed !== null) return parsed;
  }

  return null;
}

function extractSeverity(
  vuln: OsvVulnerability,
  score: number | null,
): SeverityLevel {
  const dbSeverity = vuln.database_specific?.severity;
  if (typeof dbSeverity === "string") {
    const normalized = dbSeverity.toUpperCase();
    if (
      normalized === "CRITICAL" ||
      normalized === "HIGH" ||
      normalized === "MEDIUM" ||
      normalized === "LOW"
    ) {
      return normalized;
    }
  }

  return scoreToSeverity(score);
}

export function normalizeVulnerability(vuln: OsvVulnerability): VulnAlert {
  const cvss = extractScore(vuln);
  const severity = extractSeverity(vuln, cvss);

  return {
    id: vuln.id,
    aliases: vuln.aliases ?? [],
    summary: vuln.summary ?? vuln.details ?? "No summary provided",
    severity,
    cvss,
    fixedIn: extractFixedIn(vuln),
  };
}

export function deriveRiskLevel(alerts: VulnAlert[]): RiskLevel {
  if (alerts.length === 0) return "SAFE";
  const highest = alerts.reduce<SeverityLevel>(
    (acc, next) => (ORDER[next.severity] > ORDER[acc] ? next.severity : acc),
    "UNKNOWN",
  );

  return highest === "UNKNOWN" ? "LOW" : highest;
}

export function summarizeRisks(levels: RiskLevel[]): Record<RiskLevel, number> {
  const summary: Record<RiskLevel, number> = {
    SAFE: 0,
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };

  for (const level of levels) {
    summary[level] += 1;
  }

  return summary;
}
