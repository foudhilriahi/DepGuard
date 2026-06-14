export type SeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "SAFE";

export interface OsvPackageQuery {
  packageName: string;
  version?: string;
}

export interface OsvSeverity {
  type?: string;
  score?: string;
}

export interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
}

export interface OsvRange {
  type?: string;
  events?: OsvEvent[];
}

export interface OsvAffected {
  package?: {
    ecosystem?: string;
    name?: string;
    purl?: string;
  };
  ranges?: OsvRange[];
  versions?: string[];
}

export interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: OsvSeverity[];
  affected?: OsvAffected[];
  database_specific?: {
    severity?: string;
    cvss?: string | { score?: string | number };
    [key: string]: unknown;
  };
}

export interface RegistryDeprecation {
  deprecated: boolean;
  message?: string;
}

export interface PackageCheckInput {
  packageName: string;
  version?: string;
  useCache?: boolean;
}

export interface BulkPackageInput {
  name: string;
  version?: string;
}

export interface VulnAlert {
  id: string;
  aliases: string[];
  summary: string;
  severity: SeverityLevel;
  cvss: number | null;
  fixedIn: string | null;
}

export interface PackageCheckResult {
  packageName: string;
  version?: string;
  versionResolution: "exact" | "range_unresolved" | "latest";
  vulnerabilities: VulnAlert[];
  vulnerabilityCount: number;
  deprecated: boolean;
  deprecationMessage?: string;
  hasIssues: boolean;
  riskLevel: RiskLevel;
  checkedAt: string;
  fromCache: boolean;
}

export interface PackageError {
  packageName: string;
  version?: string;
  source: "osv" | "npm" | "input" | "system";
  message: string;
}

export interface BulkCheckResult {
  results: PackageCheckResult[];
  total: number;
  withIssues: number;
  riskSummary: Record<RiskLevel, number>;
  checkedAt: string;
}

export interface ScanPackageJsonResult {
  filePath: string;
  packageCount: number;
  withIssues: number;
  riskSummary: Record<RiskLevel, number>;
  results: PackageCheckResult[];
  checkedAt: string;
}

export interface ToolMeta {
  cachedHits: number;
  apiCalls: number;
  durationMs: number;
  generatedAt: string;
}

export interface ToolResponse<T> {
  status: "ok" | "partial" | "error";
  data: T;
  errors: PackageError[];
  meta: ToolMeta;
}
