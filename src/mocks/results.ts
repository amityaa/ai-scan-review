import type {
  Finding,
  FindingSeverity,
  ScanResult,
  ScanScenario
} from "../models/scan.js";

const MOCK_DISCLOSURE =
  "Simulated scan: repository contents are not inspected. Findings are sample results based on deterministic demo scenarios.";

const severityRank: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const unsortedSampleFindings: Finding[] = [
  {
    severity: "critical",
    title: "Hardcoded API token pattern",
    category: "secret",
    location: "src/config/payment.ts:12",
    evidence: "Sample evidence matched a token-like string assigned to PAYMENT_API_KEY.",
    whyItMatters:
      "A committed credential can let an attacker access third-party services until the token is revoked.",
    nextAction:
      "Revoke the exposed token, move the value to a secret manager, and add secret scanning to CI."
  },
  {
    severity: "high",
    title: "Outdated dependency with known remote-code-execution risk",
    category: "dependency",
    location: "package.json > sample-lib@1.2.0",
    evidence: "Sample dependency inventory maps sample-lib@1.2.0 to advisory GHSA-demo-1234.",
    whyItMatters:
      "A vulnerable runtime dependency can be exploited through normal application traffic.",
    nextAction:
      "Upgrade sample-lib to 1.2.8 or later and run the dependency test suite before release."
  },
  {
    severity: "medium",
    title: "User-controlled redirect target",
    category: "code",
    location: "src/routes/auth.ts:48",
    evidence: "Sample route redirects to a next query parameter without allowlist validation.",
    whyItMatters:
      "Open redirects are commonly chained with phishing campaigns and account takeover attempts.",
    nextAction:
      "Allow only relative paths or approved hostnames before redirecting users."
  },
  {
    severity: "low",
    title: "Security headers are incomplete",
    category: "configuration",
    location: "src/server.ts",
    evidence: "Sample HTTP configuration does not include a Content-Security-Policy header.",
    whyItMatters:
      "Missing browser protections can increase the blast radius of future client-side issues.",
    nextAction:
      "Add a conservative Content-Security-Policy and verify it in report-only mode first."
  }
];

const sampleFindings = unsortedSampleFindings.sort(
  (a, b) => severityRank[a.severity] - severityRank[b.severity]
);

export function buildResultForScenario(scenario: ScanScenario): ScanResult {
  return scenario === "clean" ? buildCleanResult() : buildFindingsResult();
}

function buildFindingsResult(): ScanResult {
  return {
    riskLevel: "critical",
    summary:
      "The simulated scan found a critical credential exposure and a high-priority dependency risk.",
    addressFirst:
      "Revoke the exposed token first, then upgrade the vulnerable dependency before shipping new changes.",
    findings: sampleFindings.map((finding) => ({ ...finding })),
    mockDisclosure: MOCK_DISCLOSURE
  };
}

function buildCleanResult(): ScanResult {
  return {
    riskLevel: "none",
    summary:
      "The simulated scan did not find sample security issues for this deterministic clean scenario.",
    addressFirst:
      "No urgent action is required. Keep dependency and secret scanning enabled in CI.",
    findings: [],
    mockDisclosure: MOCK_DISCLOSURE
  };
}
