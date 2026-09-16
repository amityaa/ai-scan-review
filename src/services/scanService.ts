import { randomUUID } from "node:crypto";
import type {
  Finding,
  FindingSeverity,
  Scan,
  ScanResult,
  ScanScenario,
  ScanState
} from "../models/scan.js";

type ProgressStep = {
  state: ScanState;
  progress: number;
  currentStep: string;
};

type ScanServiceOptions = {
  stepDelayMs?: number;
};

const MOCK_DISCLOSURE =
  "Simulated scan: repository contents are not inspected. Findings are sample results based on deterministic demo scenarios.";

const severityRank: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const activeProgression: ProgressStep[] = [
  {
    state: "cloning",
    progress: 20,
    currentStep: "Simulated progress: connecting to repository metadata."
  },
  {
    state: "analyzing_dependencies",
    progress: 45,
    currentStep: "Simulated progress: analyzing dependency manifests."
  },
  {
    state: "analyzing_code",
    progress: 70,
    currentStep: "Simulated progress: reviewing risky code patterns."
  },
  {
    state: "prioritizing_findings",
    progress: 90,
    currentStep: "Simulated progress: prioritizing findings by likely impact."
  }
];

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

export class ScanService {
  private readonly scans = new Map<string, Scan>();
  private readonly stepDelayMs: number;

  constructor(options: ScanServiceOptions = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 800;
  }

  createScan(repoUrl: string): Scan {
    const now = new Date().toISOString();
    const scan: Scan = {
      id: randomUUID(),
      repoUrl,
      scenario: selectScenario(repoUrl),
      state: "queued",
      progress: 0,
      currentStep: "Simulated progress: scan queued.",
      createdAt: now,
      updatedAt: now
    };

    this.scans.set(scan.id, scan);
    this.advanceScan(scan.id, 0);

    return cloneScan(scan);
  }

  getScan(id: string): Scan | undefined {
    const scan = this.scans.get(id);
    return scan ? cloneScan(scan) : undefined;
  }

  private advanceScan(id: string, stepIndex: number): void {
    const delay = stepIndex === 0 ? this.stepDelayMs : this.stepDelayMs;

    setTimeout(() => {
      const scan = this.scans.get(id);
      if (!scan || scan.state === "completed" || scan.state === "failed") {
        return;
      }

      const step = activeProgression[stepIndex];
      if (step) {
        this.applyProgressStep(scan, step);
        this.advanceScan(id, stepIndex + 1);
        return;
      }

      this.finishScan(scan);
    }, delay);
  }

  private applyProgressStep(scan: Scan, step: ProgressStep): void {
    scan.state = step.state;
    scan.progress = step.progress;
    scan.currentStep = step.currentStep;
    scan.updatedAt = new Date().toISOString();
  }

  private finishScan(scan: Scan): void {
    const now = new Date().toISOString();

    if (scan.scenario === "failure") {
      scan.state = "failed";
      scan.progress = 100;
      scan.currentStep = "Simulated progress: scan failed during repository preparation.";
      scan.error =
        "Simulated failure scenario selected because the repository name is \"fail-demo\".";
      scan.updatedAt = now;
      scan.completedAt = now;
      return;
    }

    scan.state = "completed";
    scan.progress = 100;
    scan.currentStep = "Simulated progress: scan completed.";
    scan.result =
      scan.scenario === "clean" ? buildCleanResult() : buildFindingsResult();
    scan.updatedAt = now;
    scan.completedAt = now;
  }
}

export function selectScenario(repoUrl: string): ScanScenario {
  const repoName = getRepositoryName(repoUrl);

  if (repoName === "fail-demo") {
    return "failure";
  }

  if (repoName === "clean-demo") {
    return "clean";
  }

  return "findings";
}

function getRepositoryName(repoUrl: string): string {
  try {
    const parsed = new URL(repoUrl);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts[1]?.toLowerCase() ?? "";
  } catch {
    return "";
  }
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

function cloneScan(scan: Scan): Scan {
  return {
    ...scan,
    result: scan.result ? cloneResult(scan.result) : undefined
  };
}

function cloneResult(result: ScanResult): ScanResult {
  return {
    ...result,
    findings: result.findings.map((finding) => ({ ...finding }))
  };
}
