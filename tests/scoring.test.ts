import { describe, expect, it } from "vitest";
import {
  deriveRiskLevel,
  normalizeVulnerability,
  parseCvssScore,
  scoreToSeverity,
} from "../src/scoring.js";

describe("scoring", () => {
  it("parses plain numeric CVSS", () => {
    expect(parseCvssScore("7.5")).toBe(7.5);
  });

  it("parses CVSS vector strings", () => {
    expect(
      parseCvssScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/9.8"),
    ).toBe(9.8);
  });

  it("maps score to severity", () => {
    expect(scoreToSeverity(9.8)).toBe("CRITICAL");
    expect(scoreToSeverity(7.2)).toBe("HIGH");
    expect(scoreToSeverity(5.1)).toBe("MEDIUM");
    expect(scoreToSeverity(1.2)).toBe("LOW");
    expect(scoreToSeverity(null)).toBe("UNKNOWN");
  });

  it("normalizes vulnerability and derives package risk", () => {
    const alert = normalizeVulnerability({
      id: "GHSA-test",
      aliases: ["CVE-2026-0001"],
      summary: "Example vuln",
      severity: [{ type: "CVSS_V3", score: "9.1" }],
      affected: [
        { ranges: [{ events: [{ introduced: "0", fixed: "2.0.0" }] }] },
      ],
    });

    expect(alert.severity).toBe("CRITICAL");
    expect(alert.fixedIn).toBe("2.0.0");
    expect(deriveRiskLevel([alert])).toBe("CRITICAL");
  });
});
